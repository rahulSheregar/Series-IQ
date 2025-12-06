const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';

/**
 * Generate user context using OpenAI based on onboarding answers or custom prompt
 * @param {Object|string} onboardingAnswersOrPrompt - User's onboarding answers object OR custom prompt string
 * @returns {Promise<Object>} - Object with context_text and key_topics
 */
async function generateUserContext(onboardingAnswersOrPrompt) {
    try {
        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }

        // Check if it's a custom prompt (string) or onboarding answers (object)
        let prompt;
        if (typeof onboardingAnswersOrPrompt === 'string') {
            // Custom prompt provided directly
            prompt = onboardingAnswersOrPrompt;
        } else if (onboardingAnswersOrPrompt.custom_prompt) {
            // Custom prompt in object
            prompt = onboardingAnswersOrPrompt.custom_prompt;
        } else {
            // Build prompt from onboarding answers
            prompt = buildContextPrompt(onboardingAnswersOrPrompt);
        }

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an assistant that creates user profiles and context based on provided information. Generate a concise context description and extract key topics/interests.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const aiResponse = response.data.choices[0].message.content;

        // Parse the response to extract context and topics
        const parsed = parseAIResponse(aiResponse);

        return {
            context_text: parsed.context || aiResponse,
            key_topics: parsed.topics || []
        };
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('❌ Connection error to OpenAI API:', error.message);
        } else if (error.response) {
            console.error(`❌ OpenAI API error (${error.response.status}):`, error.response.data);
        } else {
            console.error('❌ Error generating user context:', error.message);
        }
        throw error;
    }
}

/**
 * Build prompt from onboarding answers
 * @param {Object} answers - Onboarding answers object
 * @returns {string} - Formatted prompt
 */
function buildContextPrompt(answers) {
    const parts = [];

    if (answers.name) parts.push(`Name: ${answers.name}`);
    if (answers.email) parts.push(`Email: ${answers.email}`);
    if (answers.age) parts.push(`Age: ${answers.age}`);
    if (answers.location) parts.push(`Location: ${answers.location}`);
    if (answers.about_me) parts.push(`About: ${answers.about_me}`);
    if (answers.occupation) parts.push(`Occupation: ${answers.occupation}`);
    if (answers.referral_source) parts.push(`Referral: ${answers.referral_source}`);

    const userInfo = parts.join('\n');

    return `Based on the following user information, generate:
1. A concise context description (2-3 sentences) about this user, their background, and interests
2. A list of 5-10 key topics/interests that would be relevant for AI search and content recommendations

User Information:
${userInfo}

Please format your response as:
CONTEXT: [your context description here]
TOPICS: [topic1, topic2, topic3, ...]`;
}

/**
 * Parse AI response to extract context and topics
 * @param {string} response - AI response text
 * @returns {Object} - Object with context and topics array
 */
function parseAIResponse(response) {
    const result = {
        context: '',
        topics: []
    };

    // Try to extract CONTEXT section
    const contextMatch = response.match(/CONTEXT:\s*(.+?)(?=TOPICS:|$)/is);
    if (contextMatch) {
        result.context = contextMatch[1].trim();
    } else {
        // If no CONTEXT tag, use first paragraph
        result.context = response.split('\n\n')[0].trim();
    }

    // Try to extract TOPICS section
    const topicsMatch = response.match(/TOPICS:\s*(.+?)$/is);
    if (topicsMatch) {
        const topicsText = topicsMatch[1].trim();
        // Parse comma or newline separated topics
        result.topics = topicsText
            .split(/[,\n]/)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .slice(0, 10); // Limit to 10 topics
    }

    return result;
}

module.exports = {
    generateUserContext
};

