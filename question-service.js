const axios = require('axios');
const { sendMessage } = require('./series-api');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';

/**
 * Detect if a message is a question
 * @param {string} messageText - The message text to analyze
 * @returns {Promise<boolean>} - True if the message is a question
 */
async function isQuestion(messageText) {
    try {
        if (!OPENAI_API_KEY) {
            // Fallback to simple pattern matching if OpenAI is not configured
            return detectQuestionPattern(messageText);
        }

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a classifier that determines if a message is a question. Respond with only "YES" or "NO".'
                    },
                    {
                        role: 'user',
                        content: `Is this a question? "${messageText}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const answer = response.data.choices[0].message.content.trim().toUpperCase();
        return answer.includes('YES');
    } catch (error) {
        // Fallback to pattern matching on error
        console.warn('⚠️  Error detecting question with AI, using pattern matching:', error.message);
        return detectQuestionPattern(messageText);
    }
}

/**
 * Simple pattern-based question detection (fallback)
 * @param {string} messageText - The message text to analyze
 * @returns {boolean} - True if the message looks like a question
 */
function detectQuestionPattern(messageText) {
    const text = messageText.trim();
    
    // Check for question marks
    if (text.endsWith('?')) {
        return true;
    }

    // Check for question words at the start
    const questionWords = ['what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose', 'whom', 'can', 'could', 'would', 'should', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'will', 'may', 'might'];
    const firstWord = text.toLowerCase().split(/\s+/)[0];
    
    if (questionWords.includes(firstWord)) {
        return true;
    }

    return false;
}

/**
 * Detect if a question is a connection request
 * @param {string} question - The question text
 * @returns {Promise<boolean>} - True if it's a connection request
 */
async function isConnectionRequest(question) {
    try {
        if (!OPENAI_API_KEY) {
            // Fallback pattern matching
            const lowerQuestion = question.toLowerCase();
            return lowerQuestion.includes('connect') || 
                   lowerQuestion.includes('find') || 
                   lowerQuestion.includes('match') ||
                   lowerQuestion.includes('introduce') ||
                   lowerQuestion.includes('someone who');
        }

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a classifier. Determine if the user is asking to connect with or find other users. Respond with only "YES" or "NO".'
                    },
                    {
                        role: 'user',
                        content: `Is this a request to connect with or find other users? "${question}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const answer = response.data.choices[0].message.content.trim().toUpperCase();
        return answer.includes('YES');
    } catch (error) {
        // Fallback to pattern matching
        const lowerQuestion = question.toLowerCase();
        return lowerQuestion.includes('connect') || 
               lowerQuestion.includes('find') || 
               lowerQuestion.includes('match') ||
               lowerQuestion.includes('introduce') ||
               lowerQuestion.includes('someone who');
    }
}

/**
 * Search for matching users based on connection request
 * @param {string} phoneNumber - Requesting user's phone number
 * @param {string} request - The connection request text
 * @param {number} chatId - Chat ID
 * @returns {Promise<string>} - Response message with matches
 */
async function findMatchingUsers(phoneNumber, request, chatId) {
    try {
        const { supabase } = require('./supabase');
        const { sendMessage } = require('./series-api');

        // Use OpenAI to extract search keywords from the request
        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }

        const keywordResponse = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Extract 3-5 key search terms from the user request. Return only comma-separated keywords, no explanation.'
                    },
                    {
                        role: 'user',
                        content: `Extract search keywords from: "${request}"`
                    }
                ],
                temperature: 0.3,
                max_tokens: 50
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const keywords = keywordResponse.data.choices[0].message.content.trim().toLowerCase().split(',').map(k => k.trim());
        console.log(`🔍 Search keywords extracted: ${keywords.join(', ')}`);

        // Filter out generic keywords like "connect", "anyone", "find" that won't match user content
        const meaningfulKeywords = keywords.filter(k => 
            !['connect', 'anyone', 'find', 'someone', 'who', 'me', 'to', 'is', 'are', 'the', 'a', 'an'].includes(k)
        );

        if (meaningfulKeywords.length === 0) {
            meaningfulKeywords.push(...keywords.slice(0, 2)); // Fallback to first 2 keywords
        }

        console.log(`🔍 Using meaningful keywords: ${meaningfulKeywords.join(', ')}`);

        // Search for users with matching topics or activities
        // Build search conditions - primarily search in context_text, then check JSONB arrays
        let searchConditions = [];
        
        meaningfulKeywords.forEach(keyword => {
            // Search in context_text (most reliable)
            searchConditions.push(`context_text.ilike.%${keyword}%`);
        });

        // Get all users first, then filter in JavaScript for JSONB array matching
        // This is more reliable than complex JSONB queries
        const { data: allUsers, error: fetchError } = await supabase
            .from('user_daily_context')
            .select(`
                phone_number,
                context_text,
                key_topics,
                activities,
                user_profile:user_profile_id (
                    name,
                    phone_number
                )
            `)
            .neq('phone_number', phoneNumber); // Exclude the requesting user

        if (fetchError) {
            console.error('Error fetching users:', fetchError);
            throw fetchError;
        }

        if (!allUsers || allUsers.length === 0) {
            const message = "I couldn't find anyone matching that criteria right now. Try again later or be more specific!";
            await sendMessage(phoneNumber, message, chatId);
            return message;
        }

        // Filter users by matching keywords in context_text, key_topics, or activities
        const matchingUsers = allUsers.filter(user => {
            const contextLower = (user.context_text || '').toLowerCase();
            const topicsLower = JSON.stringify(user.key_topics || []).toLowerCase();
            const activitiesLower = JSON.stringify(user.activities || []).toLowerCase();
            
            // Check if any meaningful keyword matches
            return meaningfulKeywords.some(keyword => 
                contextLower.includes(keyword) || 
                topicsLower.includes(keyword) || 
                activitiesLower.includes(keyword)
            );
        }).slice(0, 5); // Limit to 5 results

        if (!matchingUsers || matchingUsers.length === 0) {
            const message = "I couldn't find anyone matching that criteria right now. Try again later or be more specific!";
            await sendMessage(phoneNumber, message, chatId);
            return message;
        }

        // Format the response
        let responseMessage = `Found ${matchingUsers.length} matching user${matchingUsers.length > 1 ? 's' : ''}:\n\n`;
        
        matchingUsers.forEach((user, index) => {
            const userName = user.user_profile?.name || 'User';
            const phone = user.phone_number;
            const context = user.context_text.substring(0, 100) + (user.context_text.length > 100 ? '...' : '');
            
            responseMessage += `${index + 1}. ${userName} (${phone})\n   ${context}\n\n`;
        });

        await sendMessage(phoneNumber, responseMessage, chatId);
        console.log(`🔗 Found ${matchingUsers.length} matching users for ${phoneNumber}`);
        return responseMessage;
    } catch (error) {
        console.error('Error finding matching users:', error);
        const { sendMessage } = require('./series-api');
        try {
            await sendMessage(phoneNumber, "I'm having trouble finding matches right now. Please try again later.", chatId);
        } catch (sendError) {
            console.error('Failed to send error message:', sendError);
        }
        throw error;
    }
}

/**
 * Answer a user's question using AI
 * @param {string} phoneNumber - User's phone number
 * @param {string} question - The question to answer
 * @param {number} chatId - Chat ID
 * @returns {Promise<string>} - The AI-generated answer
 */
async function answerQuestion(phoneNumber, question, chatId) {
    try {
        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }

        // Get user context for personalized answers
        const { supabase } = require('./supabase');
        const { data: userProfile } = await supabase
            .from('user_profile')
            .select('name, onboarding_answers')
            .eq('phone_number', phoneNumber)
            .single();

        const userName = userProfile?.name || 'there';
        const userContext = userProfile?.onboarding_answers || {};

        // Build context string
        let contextInfo = '';
        if (userContext.occupation) {
            contextInfo += `Occupation: ${userContext.occupation}. `;
        }
        if (userContext.location) {
            contextInfo += `Location: ${userContext.location}. `;
        }
        if (userContext.about_me) {
            contextInfo += `About: ${userContext.about_me}. `;
        }

        const systemPrompt = `You are a helpful assistant. Answer questions concisely and helpfully. 
${contextInfo ? `User context: ${contextInfo}` : ''}
Keep responses brief and conversational (2-3 sentences max).`;

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: question
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const answer = response.data.choices[0].message.content.trim();
        
        // Send the answer to the user
        await sendMessage(phoneNumber, answer, chatId);
        console.log(`💬 Answered question for ${phoneNumber}`);
        
        return answer;
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('❌ Connection error to OpenAI API:', error.message);
        } else if (error.response) {
            console.error(`❌ OpenAI API error (${error.response.status}):`, error.response.data);
        } else {
            console.error('❌ Error answering question:', error.message);
        }
        
        // Send a fallback message
        try {
            await sendMessage(phoneNumber, "I'm having trouble processing that right now. Could you try rephrasing your question?", chatId);
        } catch (sendError) {
            console.error('Failed to send fallback message:', sendError);
        }
        
        throw error;
    }
}

/**
 * Classify message type using OpenAI
 * @param {string} messageText - The message text to classify
 * @returns {Promise<string>} - Returns "daily_update" or "question"
 */
async function classifyMessageType(messageText) {
    try {
        if (!OPENAI_API_KEY) {
            // Fallback to simple pattern matching
            return detectQuestionPattern(messageText) ? 'question' : 'daily_update';
        }

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a message classifier. Classify user messages into one of two categories:
- "daily_update": User is sharing what they're doing, their status, activities, or updates about their day (e.g., "I'm going to a hackathon", "Working on a project", "Just finished a meeting")
- "question": User is asking a question, making a request, or seeking information/connection (e.g., "What's the weather?", "Connect me to someone who...", "Can you help me...")

Respond with ONLY one word: "daily_update" or "question"`
                    },
                    {
                        role: 'user',
                        content: `Classify this message: "${messageText}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 20
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        const classification = response.data.choices[0].message.content.trim().toLowerCase();
        
        // Normalize the response
        if (classification.includes('daily_update') || classification.includes('update')) {
            return 'daily_update';
        } else if (classification.includes('question') || classification.includes('request')) {
            return 'question';
        } else {
            // Fallback if response is unclear
            console.warn(`⚠️  Unclear classification: "${classification}", defaulting to pattern matching`);
            return detectQuestionPattern(messageText) ? 'question' : 'daily_update';
        }
    } catch (error) {
        // Fallback to pattern matching on error
        console.warn('⚠️  Error classifying message with AI, using pattern matching:', error.message);
        return detectQuestionPattern(messageText) ? 'question' : 'daily_update';
    }
}

module.exports = {
    isQuestion,
    answerQuestion,
    detectQuestionPattern,
    classifyMessageType,
    isConnectionRequest,
    findMatchingUsers
};

