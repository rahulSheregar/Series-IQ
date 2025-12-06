const { supabase } = require('./supabase');
const { sendMessage } = require('./series-api');

// Define the 7 onboarding questions
const ONBOARDING_QUESTIONS = [
    {
        number: 1,
        question: "What's your name?",
        field: 'name'
    },
    {
        number: 2,
        question: "What's your email address?",
        field: 'email'
    },
    {
        number: 3,
        question: "What's your age?",
        field: 'age'
    },
    {
        number: 4,
        question: "What's your location?",
        field: 'location'
    },
    {
        number: 5,
        question: "What are your interests?",
        field: 'interests'
    },
    {
        number: 6,
        question: "What's your occupation?",
        field: 'occupation'
    },
    {
        number: 7,
        question: "How did you hear about us?",
        field: 'referral_source'
    }
];

/**
 * Check if user is a first-time user (hasn't completed onboarding)
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} - User profile or null if not found
 */
async function getUserProfile(phoneNumber) {
    try {
        const { data, error } = await supabase
            .from('user_profile')
            .select('*')
            .eq('phone_number', phoneNumber)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching user profile:', error);
            throw error;
        }

        return data || null;
    } catch (error) {
        console.error('Error in getUserProfile:', error);
        throw error;
    }
}

/**
 * Start onboarding for a first-time user
 * @param {string} phoneNumber - User's phone number
 * @param {number} chatId - Chat ID to send message to
 * @returns {Promise<Object>} - Updated user profile
 */
async function startOnboarding(phoneNumber, chatId) {
    try {
        // Update user profile to start onboarding
        const { data, error } = await supabase
            .from('user_profile')
            .update({
                onboarding_current_question: 1,
                onboarding_completed: false,
                onboarding_answers: {}
            })
            .eq('phone_number', phoneNumber)
            .select()
            .single();

        if (error) {
            console.error('Error starting onboarding:', error);
            throw error;
        }

        // Send welcome message and first question
        const welcomeMessage = "Your first time user! Let's grab some info from you. What's your name?";
        try {
            await sendMessage(phoneNumber, welcomeMessage, chatId);
            console.log(`🚀 Started onboarding for ${phoneNumber}`);
        } catch (error) {
            console.error(`⚠️  Failed to send onboarding message to ${phoneNumber}, but onboarding state is saved.`);
            console.error(`   User will be prompted again on their next message.`);
            // Don't throw - we've saved the onboarding state, so next message will retry
        }
        return data;
    } catch (error) {
        console.error('Error in startOnboarding:', error);
        throw error;
    }
}

/**
 * Process user's answer to current onboarding question
 * @param {string} phoneNumber - User's phone number
 * @param {string} messageText - User's response
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} - Updated user profile
 */
async function processOnboardingAnswer(phoneNumber, messageText, chatId) {
    try {
        // Get current user profile
        const userProfile = await getUserProfile(phoneNumber);
        if (!userProfile) {
            throw new Error('User profile not found');
        }

        const currentQuestionNum = userProfile.onboarding_current_question;
        if (!currentQuestionNum || currentQuestionNum < 1 || currentQuestionNum > 7) {
            // Not in onboarding flow
            return userProfile;
        }

        const currentQuestion = ONBOARDING_QUESTIONS[currentQuestionNum - 1];
        const normalizedMessage = messageText.trim().toUpperCase();

        // Check if user wants to skip
        if (normalizedMessage === 'SKIP') {
            // Save SKIP as answer
            const answers = userProfile.onboarding_answers || {};
            answers[currentQuestion.field] = 'SKIPPED';

            // Move to next question or complete
            const nextQuestionNum = currentQuestionNum + 1;

            if (nextQuestionNum > 7) {
                // Complete onboarding
                const { data, error } = await supabase
                    .from('user_profile')
                    .update({
                        onboarding_current_question: null,
                        onboarding_completed: true,
                        onboarding_answers: answers
                    })
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;

                try {
                    await sendMessage(phoneNumber, "Thanks for completing the onboarding! We're all set.", chatId);
                    console.log(`✅ Completed onboarding for ${phoneNumber}`);
                } catch (error) {
                    console.error(`⚠️  Failed to send completion message, but onboarding is marked complete.`);
                }
                return data;
            } else {
                // Move to next question
                const nextQuestion = ONBOARDING_QUESTIONS[nextQuestionNum - 1];
                const { data, error } = await supabase
                    .from('user_profile')
                    .update({
                        onboarding_current_question: nextQuestionNum,
                        onboarding_answers: answers
                    })
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;

                try {
                    await sendMessage(phoneNumber, nextQuestion.question, chatId);
                    console.log(`➡️  Moved to question ${nextQuestionNum} for ${phoneNumber}`);
                } catch (error) {
                    console.error(`⚠️  Failed to send question ${nextQuestionNum}, but progress is saved.`);
                    console.error(`   User will receive the question on their next message.`);
                }
                return data;
            }
        } else {
            // Save answer
            const answers = userProfile.onboarding_answers || {};
            answers[currentQuestion.field] = messageText.trim();

            // Special handling for name (save to name field as well)
            if (currentQuestion.field === 'name') {
                const { data, error } = await supabase
                    .from('user_profile')
                    .update({
                        name: messageText.trim(),
                        onboarding_answers: answers
                    })
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;
                userProfile.name = messageText.trim();
            }

            // Move to next question or complete
            const nextQuestionNum = currentQuestionNum + 1;

            if (nextQuestionNum > 7) {
                // Complete onboarding
                const updateData = {
                    onboarding_current_question: null,
                    onboarding_completed: true,
                    onboarding_answers: answers
                };

                if (currentQuestion.field === 'name') {
                    updateData.name = messageText.trim();
                }

                const { data, error } = await supabase
                    .from('user_profile')
                    .update(updateData)
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;

                try {
                    await sendMessage(phoneNumber, "Thanks for completing the onboarding! We're all set.", chatId);
                    console.log(`✅ Completed onboarding for ${phoneNumber}`);
                } catch (error) {
                    console.error(`⚠️  Failed to send completion message, but onboarding is marked complete.`);
                }
                return data;
            } else {
                // Move to next question
                const nextQuestion = ONBOARDING_QUESTIONS[nextQuestionNum - 1];
                const updateData = {
                    onboarding_current_question: nextQuestionNum,
                    onboarding_answers: answers
                };

                if (currentQuestion.field === 'name') {
                    updateData.name = messageText.trim();
                }

                const { data, error } = await supabase
                    .from('user_profile')
                    .update(updateData)
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;

                try {
                    await sendMessage(phoneNumber, nextQuestion.question, chatId);
                    console.log(`➡️  Moved to question ${nextQuestionNum} for ${phoneNumber}`);
                } catch (error) {
                    console.error(`⚠️  Failed to send question ${nextQuestionNum}, but progress is saved.`);
                    console.error(`   User will receive the question on their next message.`);
                }
                return data;
            }
        }
    } catch (error) {
        console.error('Error in processOnboardingAnswer:', error);
        throw error;
    }
}

/**
 * Check if user is in onboarding flow
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<boolean>} - True if user is in onboarding
 */
async function isInOnboarding(phoneNumber) {
    try {
        const userProfile = await getUserProfile(phoneNumber);
        if (!userProfile) return false;

        return userProfile.onboarding_current_question !== null &&
            userProfile.onboarding_current_question >= 1 &&
            userProfile.onboarding_current_question <= 7;
    } catch (error) {
        console.error('Error in isInOnboarding:', error);
        return false;
    }
}

module.exports = {
    getUserProfile,
    startOnboarding,
    processOnboardingAnswer,
    isInOnboarding,
    ONBOARDING_QUESTIONS
};

