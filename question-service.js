const axios = require("axios");
const { sendMessage } = require("./series-api");
require("dotenv").config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL =
  process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

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
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a classifier that determines if a message is a question. Respond with only "YES" or "NO".',
          },
          {
            role: "user",
            content: `Is this a question? "${messageText}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const answer = response.data.choices[0].message.content
      .trim()
      .toUpperCase();
    return answer.includes("YES");
  } catch (error) {
    // Fallback to pattern matching on error
    console.warn(
      "⚠️  Error detecting question with AI, using pattern matching:",
      error.message
    );
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
  if (text.endsWith("?")) {
    return true;
  }

  // Check for question words at the start
  const questionWords = [
    "what",
    "who",
    "where",
    "when",
    "why",
    "how",
    "which",
    "whose",
    "whom",
    "can",
    "could",
    "would",
    "should",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "will",
    "may",
    "might",
  ];
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
      return (
        lowerQuestion.includes("connect") ||
        lowerQuestion.includes("find") ||
        lowerQuestion.includes("match") ||
        lowerQuestion.includes("introduce") ||
        lowerQuestion.includes("someone who")
      );
    }

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'You are a classifier. Determine if the user is asking to connect with or find other users. Respond with only "YES" or "NO".',
          },
          {
            role: "user",
            content: `Is this a request to connect with or find other users? "${question}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const answer = response.data.choices[0].message.content
      .trim()
      .toUpperCase();
    return answer.includes("YES");
  } catch (error) {
    // Fallback to pattern matching
    const lowerQuestion = question.toLowerCase();
    return (
      lowerQuestion.includes("connect") ||
      lowerQuestion.includes("find") ||
      lowerQuestion.includes("match") ||
      lowerQuestion.includes("introduce") ||
      lowerQuestion.includes("someone who")
    );
  }
}

/**
 * Score a user's context against a request using AI
 * @param {string} request - The connection request
 * @param {Object} userContext - User's context object
 * @returns {Promise<number>} - Confidence score between 0 and 1
 */
async function scoreUserMatch(request, userContext) {
  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const contextText = userContext.context_text || "";
    // Handle key_topics and activities - they might be strings (JSON) or arrays
    let topics = [];
    let activities = [];

    if (Array.isArray(userContext.key_topics)) {
      topics = userContext.key_topics;
    } else if (typeof userContext.key_topics === "string") {
      try {
        topics = JSON.parse(userContext.key_topics);
      } catch (e) {
        topics = [];
      }
    }

    if (Array.isArray(userContext.activities)) {
      activities = userContext.activities;
    } else if (typeof userContext.activities === "string") {
      try {
        activities = JSON.parse(userContext.activities);
      } catch (e) {
        activities = [];
      }
    }

    const topicsStr = topics.join(", ");
    const activitiesStr = activities.join(", ");

    const fullContext = `${contextText}\nTopics: ${topicsStr}\nActivities: ${activitiesStr}`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a matching system. Rate how well a user context matches a request on a scale of 0.0 to 1.0. Respond with ONLY a number between 0.0 and 1.0 (e.g., 0.85), no explanation.",
          },
          {
            role: "user",
            content: `Request: "${request}"\n\nUser Context:\n${fullContext}\n\nRate the match (0.0 to 1.0):`,
          },
        ],
        temperature: 0.1,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const scoreText = response.data.choices[0].message.content.trim();
    const score = parseFloat(scoreText);

    // Validate score is between 0 and 1
    if (isNaN(score) || score < 0 || score > 1) {
      console.warn(`⚠️  Invalid score returned: ${scoreText}, defaulting to 0`);
      return 0;
    }

    return score;
  } catch (error) {
    console.error("Error scoring user match:", error.message);
    return 0; // Return 0 on error
  }
}

/**
 * Search for matching users based on connection request using AI confidence scoring
 * @param {string} phoneNumber - Requesting user's phone number
 * @param {string} request - The connection request text
 * @param {number} chatId - Chat ID
 * @returns {Promise<string>} - Response message with matches
 */
async function findMatchingUsers(phoneNumber, request, chatId) {
  try {
    const { supabase } = require("./supabase");
    const { sendMessage } = require("./series-api");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Allow self-matching for testing (default: true, set ALLOW_SELF_MATCH=false to disable)
    const allowSelfMatch = process.env.ALLOW_SELF_MATCH !== "false";

    // Get all users with their contexts from both daily_context and user_context tables
    // First, get from user_daily_context
    let dailyQuery = supabase.from("user_daily_context").select(`
                phone_number,
                context_text,
                key_topics,
                activities,
                user_profile:user_profile_id (
                    name,
                    phone_number
                )
            `);

    if (!allowSelfMatch) {
      dailyQuery = dailyQuery.neq("phone_number", phoneNumber); // Exclude the requesting user
    }

    const { data: dailyContextUsers, error: dailyError } = await dailyQuery;

    if (dailyError) {
      console.error("Error fetching daily context users:", dailyError);
    } else {
      console.log(
        `📊 Daily context query returned ${
          dailyContextUsers?.length || 0
        } users`
      );
    }

    // Also get from user_context (onboarding context)
    let onboardingQuery = supabase.from("user_context").select(`
                phone_number,
                context_text,
                key_topics,
                user_profile:user_profile_id (
                    name,
                    phone_number
                )
            `);

    if (!allowSelfMatch) {
      onboardingQuery = onboardingQuery.neq("phone_number", phoneNumber); // Exclude the requesting user
    }

    const { data: onboardingContextUsers, error: onboardingError } =
      await onboardingQuery;

    if (onboardingError) {
      console.error(
        "Error fetching onboarding context users:",
        onboardingError
      );
    } else {
      console.log(
        `📊 Onboarding context query returned ${
          onboardingContextUsers?.length || 0
        } users`
      );
    }

    if (onboardingError) {
      console.error(
        "Error fetching onboarding context users:",
        onboardingError
      );
    }

    // Combine both sources, prioritizing daily_context if both exist for same user
    const userMap = new Map();

    // Add onboarding context users first
    if (onboardingContextUsers) {
      onboardingContextUsers.forEach((user) => {
        userMap.set(user.phone_number, {
          phone_number: user.phone_number,
          context_text: user.context_text,
          key_topics: user.key_topics || [],
          activities: [], // onboarding context doesn't have activities
          user_profile: user.user_profile,
        });
      });
    }

    // Override with daily context users (more recent/accurate)
    if (dailyContextUsers) {
      dailyContextUsers.forEach((user) => {
        userMap.set(user.phone_number, {
          phone_number: user.phone_number,
          context_text: user.context_text,
          key_topics: user.key_topics || [],
          activities: user.activities || [],
          user_profile: user.user_profile,
        });
      });
    }

    const allUsers = Array.from(userMap.values());

    if (dailyError && onboardingError) {
      console.error("Error fetching users:", dailyError, onboardingError);
      throw dailyError;
    }

    console.log(
      `📋 Found ${allUsers.length} total users to score${
        allowSelfMatch
          ? " (self-matching enabled for testing)"
          : ` (excluding ${phoneNumber})`
      }`
    );
    console.log(`   Daily context users: ${dailyContextUsers?.length || 0}`);
    console.log(
      `   Onboarding context users: ${onboardingContextUsers?.length || 0}`
    );

    if (!allUsers || allUsers.length === 0) {
      console.log(
        `⚠️  No other users found in database. User ${phoneNumber} is the only user.`
      );
      const message =
        "I couldn't find anyone matching that criteria right now. Try again later or be more specific!";
      await sendMessage(phoneNumber, message, chatId);
      return message;
    }

    console.log(
      `🔍 Scoring ${allUsers.length} users against request: "${request}"`
    );

    if (allUsers.length === 0) {
      console.log(
        `⚠️  No other users found in database (excluding ${phoneNumber})`
      );
    }

    // Score each user's context against the request
    const scoredUsers = await Promise.all(
      allUsers.map(async (user) => {
        const score = await scoreUserMatch(request, {
          context_text: user.context_text,
          key_topics: user.key_topics,
          activities: user.activities,
        });
        console.log(
          `   Score for ${user.phone_number}: ${(score * 100).toFixed(1)}%`
        );
        return {
          ...user,
          matchScore: score,
        };
      })
    );

    // Log all scores for debugging
    console.log(
      `📊 All scores:`,
      scoredUsers
        .map((u) => `${u.phone_number}: ${(u.matchScore * 100).toFixed(1)}%`)
        .join(", ")
    );

    // Filter users with confidence >= 0.9
    const highConfidenceMatches = scoredUsers
      .filter((user) => user.matchScore >= 0.9)
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by score descending

    console.log(
      `✅ Found ${highConfidenceMatches.length} users with confidence >= 0.9`
    );

    // Log scores below threshold for debugging
    const belowThreshold = scoredUsers.filter(
      (user) => user.matchScore < 0.9 && user.matchScore > 0
    );
    if (belowThreshold.length > 0) {
      console.log(
        `⚠️  ${belowThreshold.length} users below 0.9 threshold:`,
        belowThreshold
          .map((u) => `${u.phone_number}: ${(u.matchScore * 100).toFixed(1)}%`)
          .join(", ")
      );
    }

    if (highConfidenceMatches.length === 0) {
      const message =
        "I couldn't find a matching person with high confidence. Try rephrasing your request or check back later!";
      await sendMessage(phoneNumber, message, chatId);
      return message;
    }

    // Only match with the top result (highest confidence)
    const topMatch = highConfidenceMatches[0];
    const userName = topMatch.user_profile?.name || "User";

    // Generate AI content for this match
    console.log(`🤖 Generating match content for ${userName}...`);
    const matchReason = await generateMatchReason(request, {
      context_text: topMatch.context_text,
      key_topics: topMatch.key_topics,
      activities: topMatch.activities,
    });

    const detailedSummary = await generateDetailedSummary(
      {
        context_text: topMatch.context_text,
        key_topics: topMatch.key_topics,
        activities: topMatch.activities,
      },
      userName
    );

    // Store pending match for later reveal
    await storePendingMatch(
      phoneNumber,
      topMatch,
      topMatch.matchScore,
      matchReason,
      detailedSummary,
      chatId
    );

    // Send teaser message
    const teaserMessage = `Found a match! ${userName} - ${matchReason}\n\nReply "Y" to get their contact info and full profile.`;
    await sendMessage(phoneNumber, teaserMessage, chatId);
    console.log(`📤 Sent match teaser for ${userName} to ${phoneNumber}`);

    return `Found best match (${(topMatch.matchScore * 100).toFixed(
      0
    )}% confidence) - awaiting confirmation`;
  } catch (error) {
    console.error("Error finding matching users:", error);
    const { sendMessage } = require("./series-api");
    try {
      await sendMessage(
        phoneNumber,
        "I'm having trouble finding matches right now. Please try again later.",
        chatId
      );
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
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
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Get user context for personalized answers
    const { supabase } = require("./supabase");
    const { data: userProfile } = await supabase
      .from("user_profile")
      .select("name, onboarding_answers")
      .eq("phone_number", phoneNumber)
      .single();

    const userName = userProfile?.name || "there";
    const userContext = userProfile?.onboarding_answers || {};

    // Build context string
    let contextInfo = "";
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
${contextInfo ? `User context: ${contextInfo}` : ""}
Keep responses brief and conversational (2-3 sentences max).`;

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: question,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const answer = response.data.choices[0].message.content.trim();

    // Send the answer to the user
    await sendMessage(phoneNumber, answer, chatId);
    console.log(`💬 Answered question for ${phoneNumber}`);

    return answer;
  } catch (error) {
    if (error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED") {
      console.error("❌ Connection error to OpenAI API:", error.message);
    } else if (error.response) {
      console.error(
        `❌ OpenAI API error (${error.response.status}):`,
        error.response.data
      );
    } else {
      console.error("❌ Error answering question:", error.message);
    }

    // Send a fallback message
    try {
      await sendMessage(
        phoneNumber,
        "I'm having trouble processing that right now. Could you try rephrasing your question?",
        chatId
      );
    } catch (sendError) {
      console.error("Failed to send fallback message:", sendError);
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
      return detectQuestionPattern(messageText) ? "question" : "daily_update";
    }

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a message classifier. Classify user messages into one of two categories:
- "daily_update": User is sharing what they're doing, their status, activities, or updates about their day (e.g., "I'm going to a hackathon", "Working on a project", "Just finished a meeting")
- "question": User is asking a question, making a request, or seeking information/connection (e.g., "What's the weather?", "Connect me to someone who...", "Can you help me...")

Respond with ONLY one word: "daily_update" or "question"`,
          },
          {
            role: "user",
            content: `Classify this message: "${messageText}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 20,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const classification = response.data.choices[0].message.content
      .trim()
      .toLowerCase();

    // Normalize the response
    if (
      classification.includes("daily_update") ||
      classification.includes("update")
    ) {
      return "daily_update";
    } else if (
      classification.includes("question") ||
      classification.includes("request")
    ) {
      return "question";
    } else {
      // Fallback if response is unclear
      console.warn(
        `⚠️  Unclear classification: "${classification}", defaulting to pattern matching`
      );
      return detectQuestionPattern(messageText) ? "question" : "daily_update";
    }
  } catch (error) {
    // Fallback to pattern matching on error
    console.warn(
      "⚠️  Error classifying message with AI, using pattern matching:",
      error.message
    );
    return detectQuestionPattern(messageText) ? "question" : "daily_update";
  }
}

/**
 * Generate a short match reason explaining why two users matched
 * @param {string} request - The original connection request
 * @param {Object} userContext - The matched user's context
 * @returns {Promise<string>} - Short match reason (1-2 sentences)
 */
async function generateMatchReason(request, userContext) {
  try {
    if (!OPENAI_API_KEY) {
      return "This person matches your criteria.";
    }

    const contextText = userContext.context_text || "";
    let topics = [];
    let activities = [];

    if (Array.isArray(userContext.key_topics)) {
      topics = userContext.key_topics;
    } else if (typeof userContext.key_topics === "string") {
      try {
        topics = JSON.parse(userContext.key_topics);
      } catch (e) {
        topics = [];
      }
    }

    if (Array.isArray(userContext.activities)) {
      activities = userContext.activities;
    } else if (typeof userContext.activities === "string") {
      try {
        activities = JSON.parse(userContext.activities);
      } catch (e) {
        activities = [];
      }
    }

    const topicsStr = topics.join(", ");
    const activitiesStr = activities.join(", ");

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You generate very short match explanations. Write 1-2 sentences explaining why this person is a good match for the request. Be specific and concise. Do not include the person's name.",
          },
          {
            role: "user",
            content: `Request: "${request}"\n\nMatched User Context: ${contextText}\nTopics: ${topicsStr}\nActivities: ${activitiesStr}\n\nWhy is this person a good match?`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating match reason:", error.message);
    return "This person matches your criteria.";
  }
}

/**
 * Generate a detailed summary of a matched user
 * @param {Object} userContext - The matched user's context
 * @param {string} userName - The matched user's name
 * @returns {Promise<string>} - Detailed summary (3-4 sentences)
 */
async function generateDetailedSummary(userContext, userName) {
  try {
    if (!OPENAI_API_KEY) {
      return `${userName} is a user on the platform.`;
    }

    const contextText = userContext.context_text || "";
    let topics = [];
    let activities = [];

    if (Array.isArray(userContext.key_topics)) {
      topics = userContext.key_topics;
    } else if (typeof userContext.key_topics === "string") {
      try {
        topics = JSON.parse(userContext.key_topics);
      } catch (e) {
        topics = [];
      }
    }

    if (Array.isArray(userContext.activities)) {
      activities = userContext.activities;
    } else if (typeof userContext.activities === "string") {
      try {
        activities = JSON.parse(userContext.activities);
      } catch (e) {
        activities = [];
      }
    }

    const topicsStr = topics.join(", ");
    const activitiesStr = activities.join(", ");

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You write brief, friendly profile summaries. Write 3-4 sentences about this person based on their context. Include their interests, what they're currently doing, and any relevant background. Use their name "${userName}" naturally. Be warm and personable.`,
          },
          {
            role: "user",
            content: `User Context: ${contextText}\nTopics/Interests: ${topicsStr}\nCurrent Activities: ${activitiesStr}\n\nWrite a brief summary of ${userName}:`,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating detailed summary:", error.message);
    return `${userName} is a user on the platform with shared interests.`;
  }
}

/**
 * Store a pending match in the database for later reveal
 * @param {string} requesterPhone - Phone of user who requested match
 * @param {Object} matchedUser - The matched user object
 * @param {number} matchScore - Match confidence score
 * @param {string} matchReason - AI-generated match reason
 * @param {string} detailedSummary - AI-generated detailed summary
 * @param {number} chatId - Chat ID
 * @returns {Promise<Object>} - Created pending match record
 */
async function storePendingMatch(
  requesterPhone,
  matchedUser,
  matchScore,
  matchReason,
  detailedSummary,
  chatId
) {
  try {
    const { supabase } = require("./supabase");

    // Set expiration to 24 hours from now
    const expiredAt = new Date();
    expiredAt.setHours(expiredAt.getHours() + 24);

    const { data, error } = await supabase
      .from("pending_match_details")
      .insert({
        requester_phone: requesterPhone,
        matched_phone: matchedUser.phone_number,
        matched_name: matchedUser.user_profile?.name || "User",
        match_score: matchScore,
        match_reason: matchReason,
        detailed_summary: detailedSummary,
        chat_id: chatId,
        expired_at: expiredAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error storing pending match:", error);
      throw error;
    }

    console.log(
      `💾 Stored pending match for ${requesterPhone} -> ${matchedUser.phone_number}`
    );
    return data;
  } catch (error) {
    console.error("Error in storePendingMatch:", error);
    throw error;
  }
}

/**
 * Get the most recent pending match detail for a user that hasn't been responded to
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} - Pending match record or null
 */
async function getPendingMatchDetail(phoneNumber) {
  try {
    const { supabase } = require("./supabase");

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("pending_match_details")
      .select("*")
      .eq("requester_phone", phoneNumber)
      .is("responded_at", null)
      .gt("expired_at", now) // Not expired
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching pending match:", error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("Error in getPendingMatchDetail:", error);
    return null;
  }
}

/**
 * Send full match details to user and mark as responded
 * @param {string} phoneNumber - Requester's phone number
 * @param {Object} pendingMatch - Pending match record
 * @param {number} chatId - Chat ID
 * @returns {Promise<void>}
 */
async function sendMatchDetails(phoneNumber, pendingMatch, chatId) {
  try {
    const { supabase } = require("./supabase");

    // Build the detailed message
    const message = `Here's more about ${pendingMatch.matched_name}:\n\n${pendingMatch.detailed_summary}\n\nWhy you matched: ${pendingMatch.match_reason}\n\nContact: ${pendingMatch.matched_phone}`;

    // Send the message
    await sendMessage(phoneNumber, message, chatId);
    console.log(
      `📤 Sent match details for ${pendingMatch.matched_name} to ${phoneNumber}`
    );

    // Mark as responded
    const { error } = await supabase
      .from("pending_match_details")
      .update({ responded_at: new Date().toISOString() })
      .eq("id", pendingMatch.id);

    if (error) {
      console.error("Error marking pending match as responded:", error);
    }
  } catch (error) {
    console.error("Error sending match details:", error);
    throw error;
  }
}

module.exports = {
  isQuestion,
  answerQuestion,
  detectQuestionPattern,
  classifyMessageType,
  isConnectionRequest,
  findMatchingUsers,
  generateMatchReason,
  generateDetailedSummary,
  storePendingMatch,
  getPendingMatchDetail,
  sendMatchDetails,
};
