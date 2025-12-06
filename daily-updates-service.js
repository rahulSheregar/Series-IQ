const { supabase } = require('./supabase');
const { sendMessage } = require('./series-api');
const axios = require('axios');
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';

/**
 * Call OpenAI API with a custom prompt
 * @param {string} prompt - Custom prompt
 * @returns {Promise<string>} - AI response text
 */
async function callOpenAI(prompt) {
    try {
        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
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
                max_tokens: 800
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return response.data.choices[0].message.content;
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error('❌ Connection error to OpenAI API:', error.message);
        } else if (error.response) {
            console.error(`❌ OpenAI API error (${error.response.status}):`, error.response.data);
        } else {
            console.error('❌ Error calling OpenAI:', error.message);
        }
        throw error;
    }
}

/**
 * Get all users who have completed onboarding and haven't opted out
 * @returns {Promise<Array>} - Array of user profiles
 */
async function getUsersForDailyUpdates() {
    try {
        const { data, error } = await supabase
            .from('user_profile')
            .select('id, phone_number, last_chat_id')
            .eq('onboarding_completed', true)
            .eq('stop_daily_updates', false) // Only get users who haven't opted out
            .not('phone_number', 'is', null);

        if (error) {
            console.error('Error fetching users for daily updates:', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('Error in getUsersForDailyUpdates:', error);
        throw error;
    }
}

/**
 * Stop daily updates for a user
 * @param {string} phoneNumber - User's phone number
 * @param {number} chatId - Chat ID (optional)
 * @returns {Promise<Object>} - Updated user profile
 */
async function stopDailyUpdates(phoneNumber, chatId = null) {
    try {
        const { data, error } = await supabase
            .from('user_profile')
            .update({
                stop_daily_updates: true
            })
            .eq('phone_number', phoneNumber)
            .select()
            .single();

        if (error) {
            console.error('Error stopping daily updates:', error);
            throw error;
        }

        // Send confirmation message
        if (chatId) {
            try {
                await sendMessage(phoneNumber, "Got it! I'll stop sending daily update requests. You can send 'START_UPDATES' anytime to resume.", chatId);
                console.log(`✅ Stopped daily updates for ${phoneNumber}`);
            } catch (sendError) {
                console.error(`⚠️  Failed to send confirmation to ${phoneNumber}:`, sendError.message);
            }
        }

        return data;
    } catch (error) {
        console.error('Error in stopDailyUpdates:', error);
        throw error;
    }
}

/**
 * Resume daily updates for a user
 * @param {string} phoneNumber - User's phone number
 * @param {number} chatId - Chat ID (optional)
 * @returns {Promise<Object>} - Updated user profile
 */
async function startDailyUpdates(phoneNumber, chatId = null) {
    try {
        const { data, error } = await supabase
            .from('user_profile')
            .update({
                stop_daily_updates: false
            })
            .eq('phone_number', phoneNumber)
            .select()
            .single();

        if (error) {
            console.error('Error starting daily updates:', error);
            throw error;
        }

        // Send confirmation message
        if (chatId) {
            try {
                await sendMessage(phoneNumber, "Great! I'll resume sending daily update requests. You can send 'STOP_UPDATES' anytime to stop.", chatId);
                console.log(`✅ Resumed daily updates for ${phoneNumber}`);
            } catch (sendError) {
                console.error(`⚠️  Failed to send confirmation to ${phoneNumber}:`, sendError.message);
            }
        }

        return data;
    } catch (error) {
        console.error('Error in startDailyUpdates:', error);
        throw error;
    }
}

/**
 * Check if user has already been asked for an update today
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} - True if already asked today
 */
async function hasBeenAskedToday(phoneNumber) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.toISOString();

        const { data, error } = await supabase
            .from('daily_updates')
            .select('id')
            .eq('phone_number', phoneNumber)
            .gte('requested_at', todayStart)
            .limit(1);

        if (error) {
            console.error('Error checking if asked today:', error);
            return false; // If error, allow asking
        }

        return (data && data.length > 0);
    } catch (error) {
        console.error('Error in hasBeenAskedToday:', error);
        return false; // If error, allow asking
    }
}

/**
 * Send daily update request to a user
 * @param {string} phoneNumber - User's phone number
 * @param {number} chatId - Chat ID (optional)
 * @returns {Promise<Object>} - Created update record
 */
async function requestDailyUpdate(phoneNumber, chatId = null) {
    try {
        // Get user profile to get chat ID if not provided
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profile')
            .select('id, last_chat_id')
            .eq('phone_number', phoneNumber)
            .single();

        if (profileError || !userProfile) {
            throw new Error(`User profile not found for ${phoneNumber}`);
        }

        const finalChatId = chatId || userProfile.last_chat_id;

        if (!finalChatId) {
            console.warn(`⚠️  No chat ID available for ${phoneNumber}, skipping update request`);
            return null;
        }

        // Create update request record
        const { data: updateRecord, error: insertError } = await supabase
            .from('daily_updates')
            .insert({
                user_profile_id: userProfile.id,
                phone_number: phoneNumber,
                update_text: '', // Empty until user responds
                chat_id: finalChatId,
                requested_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating update request record:', insertError);
            throw insertError;
        }

        // Send message to user
        const message = "Hey! How's your day going? What are you up to? (You can stop these updates by sending 'STOP_UPDATES')";
        try {
            await sendMessage(phoneNumber, message, finalChatId);
            console.log(`📤 Sent daily update request to ${phoneNumber}`);
            return updateRecord;
        } catch (sendError) {
            console.error(`⚠️  Failed to send update request to ${phoneNumber}:`, sendError.message);
            // Still return the record even if sending failed
            return updateRecord;
        }
    } catch (error) {
        console.error(`Error requesting daily update for ${phoneNumber}:`, error);
        throw error;
    }
}

/**
 * Save user's daily update response
 * @param {string} phoneNumber - User's phone number
 * @param {string} updateText - User's update text
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} - Updated record
 */
async function saveDailyUpdate(phoneNumber, updateText, chatId) {
    try {
        // Find the most recent update request for this user that hasn't been responded to
        const { data: pendingUpdate, error: findError } = await supabase
            .from('daily_updates')
            .select('*')
            .eq('phone_number', phoneNumber)
            .eq('update_text', '') // Empty means not responded yet
            .order('requested_at', { ascending: false })
            .limit(1)
            .single();

        if (findError || !pendingUpdate) {
            // No pending request, create a new record
            const { data: userProfile } = await supabase
                .from('user_profile')
                .select('id')
                .eq('phone_number', phoneNumber)
                .single();

            if (!userProfile) {
                throw new Error(`User profile not found for ${phoneNumber}`);
            }

            const { data, error } = await supabase
                .from('daily_updates')
                .insert({
                    user_profile_id: userProfile.id,
                    phone_number: phoneNumber,
                    update_text: updateText.trim(),
                    chat_id: chatId,
                    requested_at: new Date().toISOString(),
                    responded_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            // Update existing pending request
            const { data, error } = await supabase
                .from('daily_updates')
                .update({
                    update_text: updateText.trim(),
                    chat_id: chatId,
                    responded_at: new Date().toISOString()
                })
                .eq('id', pendingUpdate.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    } catch (error) {
        console.error('Error saving daily update:', error);
        throw error;
    }
}

/**
 * Generate context from daily updates using OpenAI
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object>} - Generated context data
 */
async function generateDailyContext(phoneNumber) {
    try {
        // Get recent daily updates (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoISO = sevenDaysAgo.toISOString();

        const { data: updates, error } = await supabase
            .from('daily_updates')
            .select('update_text, responded_at')
            .eq('phone_number', phoneNumber)
            .not('update_text', 'eq', '')
            .gte('responded_at', sevenDaysAgoISO)
            .order('responded_at', { ascending: false })
            .limit(10); // Last 10 updates

        if (error) {
            console.error('Error fetching daily updates:', error);
            throw error;
        }

        if (!updates || updates.length === 0) {
            console.log(`No recent updates found for ${phoneNumber}`);
            return null;
        }

        // Build prompt from daily updates
        const updatesText = updates
            .map((update, idx) => `${idx + 1}. ${update.update_text} (${new Date(update.responded_at).toLocaleDateString()})`)
            .join('\n');

        const prompt = `Based on the following daily updates from a user, generate:
1. A concise context description (2-3 sentences) about what this user is currently doing, their activities, and interests
2. A list of 5-15 key topics/activities that would be relevant for matching with other users (e.g., "hackathon", "coding", "networking event")
3. A list of specific activities/events mentioned (e.g., "attending hackathon", "working on project")

Daily Updates:
${updatesText}

Please format your response as:
CONTEXT: [your context description here]
TOPICS: [topic1, topic2, topic3, ...]
ACTIVITIES: [activity1, activity2, activity3, ...]`;

        // Use OpenAI to generate context
        const aiResponse = await callOpenAI(prompt);

        // Parse the response
        const parsed = parseDailyContextResponse(aiResponse);

        return {
            context_text: parsed.context || '',
            key_topics: parsed.topics || [],
            activities: parsed.activities || []
        };
    } catch (error) {
        console.error('Error generating daily context:', error);
        throw error;
    }
}

/**
 * Parse AI response to extract context, topics, and activities
 * @param {string} response - AI response text
 * @returns {Object} - Object with context, topics, and activities arrays
 */
function parseDailyContextResponse(response) {
    const result = {
        context: '',
        topics: [],
        activities: []
    };

    // Extract CONTEXT section
    const contextMatch = response.match(/CONTEXT:\s*(.+?)(?=TOPICS:|ACTIVITIES:|$)/is);
    if (contextMatch) {
        result.context = contextMatch[1].trim();
    } else {
        result.context = response.split('\n\n')[0].trim();
    }

    // Extract TOPICS section
    const topicsMatch = response.match(/TOPICS:\s*(.+?)(?=ACTIVITIES:|$)/is);
    if (topicsMatch) {
        const topicsText = topicsMatch[1].trim();
        result.topics = topicsText
            .split(/[,\n]/)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .slice(0, 15);
    }

    // Extract ACTIVITIES section
    const activitiesMatch = response.match(/ACTIVITIES:\s*(.+?)$/is);
    if (activitiesMatch) {
        const activitiesText = activitiesMatch[1].trim();
        result.activities = activitiesText
            .split(/[,\n]/)
            .map(a => a.trim())
            .filter(a => a.length > 0)
            .slice(0, 20);
    }

    return result;
}

/**
 * Save daily context to database
 * @param {string} phoneNumber - User's phone number
 * @param {string} userProfileId - User profile UUID
 * @param {Object} contextData - Object with context_text, key_topics, and activities
 * @returns {Promise<Object>} - Saved context record
 */
async function saveDailyContext(phoneNumber, userProfileId, contextData) {
    try {
        const { data, error } = await supabase
            .from('user_daily_context')
            .upsert({
                user_profile_id: userProfileId,
                phone_number: phoneNumber,
                context_text: contextData.context_text,
                key_topics: contextData.key_topics,
                activities: contextData.activities,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_profile_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving daily context:', error);
            throw error;
        }

        console.log(`✅ Saved daily context for ${phoneNumber}`);
        return data;
    } catch (error) {
        console.error('Error in saveDailyContext:', error);
        throw error;
    }
}

/**
 * Process daily update and generate context
 * @param {string} phoneNumber - User's phone number
 * @param {string} updateText - User's update text
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} - Saved update and context
 */
async function processDailyUpdate(phoneNumber, updateText, chatId) {
    try {
        // Save the update
        const updateRecord = await saveDailyUpdate(phoneNumber, updateText, chatId);
        console.log(`💾 Saved daily update for ${phoneNumber}`);

        // Get user profile ID
        const { data: userProfile } = await supabase
            .from('user_profile')
            .select('id')
            .eq('phone_number', phoneNumber)
            .single();

        if (!userProfile) {
            throw new Error(`User profile not found for ${phoneNumber}`);
        }

        // Generate and save context
        try {
            console.log(`🤖 Generating daily context for ${phoneNumber}...`);
            const contextData = await generateDailyContext(phoneNumber);
            if (contextData) {
                await saveDailyContext(phoneNumber, userProfile.id, contextData);
                console.log(`✅ Generated and saved daily context for ${phoneNumber}`);
            }
        } catch (contextError) {
            console.error(`⚠️  Failed to generate daily context for ${phoneNumber}:`, contextError.message);
            // Don't throw - update is saved even if context generation fails
        }

        return updateRecord;
    } catch (error) {
        console.error('Error processing daily update:', error);
        throw error;
    }
}

module.exports = {
    getUsersForDailyUpdates,
    hasBeenAskedToday,
    requestDailyUpdate,
    saveDailyUpdate,
    processDailyUpdate,
    generateDailyContext,
    saveDailyContext,
    stopDailyUpdates,
    startDailyUpdates
};

