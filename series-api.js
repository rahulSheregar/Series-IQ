const axios = require('axios');
require('dotenv').config();

// Series API Configuration
const SERIES_API_BASE_URL = process.env.SERIES_API_BASE_URL || 'https://api.series.im';
const SERIES_API_KEY = process.env.SERIES_API_KEY;
const SENDER_NUMBER = process.env.SERIES_SENDER_NUMBER || '+16463230991';

if (!SERIES_API_KEY) {
    console.warn('⚠️  SERIES_API_KEY not set. Message sending will fail.');
}

const apiClient = axios.create({
    baseURL: SERIES_API_BASE_URL,
    timeout: 30000, // 30 second timeout
    headers: {
        'Authorization': `Bearer ${SERIES_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

/**
 * Send a message to a user via Series API
 * @param {string} recipientPhone - Recipient phone number (E.164 format)
 * @param {string} messageText - Message text to send
 * @param {number|null} chatId - Optional chat ID if chat already exists
 * @returns {Promise<Object>} - API response
 */
async function sendMessage(recipientPhone, messageText, chatId = null) {
    try {
        if (!SERIES_API_KEY) {
            throw new Error('SERIES_API_KEY not configured');
        }

        if (chatId) {
            // Send message to existing chat
            console.log(`📤 Sending message to chat ${chatId} via ${SERIES_API_BASE_URL}/api/chats/${chatId}/chat_messages`);
            const response = await apiClient.post(`/api/chats/${chatId}/chat_messages`, {
                message: {
                    text: messageText
                }
            });
            console.log(`✅ Message sent successfully to chat ${chatId}`);
            return response.data;
        } else {
            // Create new chat and send initial message
            console.log(`📤 Creating new chat and sending message to ${recipientPhone} via ${SERIES_API_BASE_URL}/api/chats`);
            const response = await apiClient.post('/api/chats', {
                send_from: SENDER_NUMBER,
                chat: {
                    phone_numbers: [recipientPhone]
                },
                message: {
                    text: messageText
                }
            });
            console.log(`✅ Chat created and message sent successfully`);
            return response.data;
        }
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error(`❌ Connection error to Series API (${SERIES_API_BASE_URL}):`, error.message);
            console.error(`   This could be due to:`);
            console.error(`   - Network connectivity issues`);
            console.error(`   - Incorrect API base URL (current: ${SERIES_API_BASE_URL})`);
            console.error(`   - Firewall blocking the connection`);
            console.error(`   - API server being down`);
        } else if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error(`❌ Series API error (${error.response.status}):`, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            console.error(`❌ No response from Series API:`, error.message);
        } else {
            console.error(`❌ Error sending message via Series API:`, error.message);
        }
        throw error;
    }
}

/**
 * Find or create a chat with a phone number
 * @param {string} phoneNumber - Phone number to find/create chat for
 * @returns {Promise<Object>} - Chat object with id
 */
async function findOrCreateChat(phoneNumber) {
    try {
        if (!SERIES_API_KEY) {
            throw new Error('SERIES_API_KEY not configured');
        }

        // Try to find existing chat
        try {
            const findResponse = await apiClient.get('/api/chats/find', {
                params: {
                    phone_number: phoneNumber
                }
            });
            if (findResponse.data && findResponse.data.id) {
                return findResponse.data;
            }
        } catch (findError) {
            // Chat doesn't exist, will create new one
        }

        // Create new chat
        const createResponse = await apiClient.post('/api/chats', {
            send_from: SENDER_NUMBER,
            chat: {
                phone_numbers: [phoneNumber]
            },
            message: {
                text: 'Hello!'
            }
        });
        return createResponse.data;
    } catch (error) {
        console.error('Error finding/creating chat:', error.response?.data || error.message);
        throw error;
    }
}

/**
 * Test API connection
 * @returns {Promise<boolean>} - True if connection successful
 */
async function testConnection() {
    try {
        if (!SERIES_API_KEY) {
            console.warn('⚠️  SERIES_API_KEY not set');
            return false;
        }

        // Try a simple GET request to test connectivity
        const response = await apiClient.get('/api/chats', {
            params: { per_page: 1 },
            timeout: 10000 // 10 second timeout for test
        });
        console.log(`✅ Series API connection test successful (${SERIES_API_BASE_URL})`);
        return true;
    } catch (error) {
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error(`❌ Cannot connect to Series API at ${SERIES_API_BASE_URL}`);
            console.error(`   Error: ${error.message}`);
            console.error(`   Please verify:`);
            console.error(`   1. SERIES_API_BASE_URL is correct (current: ${SERIES_API_BASE_URL})`);
            console.error(`   2. Your network can reach the API`);
            console.error(`   3. The API server is running`);
        } else if (error.response && error.response.status === 401) {
            console.error(`❌ Series API authentication failed - check SERIES_API_KEY`);
        } else {
            // Other errors (like 404) might be okay - at least we connected
            console.log(`⚠️  Series API connection test: ${error.response?.status || error.message}`);
            return true; // Connection worked, even if endpoint doesn't exist
        }
        return false;
    }
}

module.exports = {
    sendMessage,
    findOrCreateChat,
    testConnection
};

