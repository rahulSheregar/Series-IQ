# Kafka Message Listener Server

A Node.js server that listens to the Kafka topic and logs incoming messages with their chat_id.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Supabase:
   - Follow the instructions in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
   - Run the SQL migrations in the `migrations/` folder:
     1. `001_create_user_profile.sql` - Creates the user_profile table
     2. `002_add_onboarding_fields.sql` - Adds onboarding tracking fields
   - Create a `.env` file with your credentials:
     ```env
     # Supabase Configuration
     SUPABASE_URL=your_supabase_project_url
     SUPABASE_SECRET_KEY=your_supabase_secret_key
     
     # Series API Configuration (for sending messages)
     SERIES_API_KEY=your_series_api_key
     SERIES_SENDER_NUMBER=+16463230991
     SERIES_API_BASE_URL=https://api.series.im
     ```

3. Start the server:
```bash
npm start
```

**If you're missing messages:** If you notice you're not receiving all messages, it might be because another consumer instance is running and sharing partitions. To receive all partitions, use:

```bash
USE_UNIQUE_GROUP=true npm start
```

This will create a unique consumer group and assign all partitions to this instance.

## Features

- Connects to the Kafka cluster using the provided credentials
- Listens to the team topic for real-time events
- Logs message text and chat_id for `message.received` events
- Also logs typing indicators and other event types
- **Automatically saves user phone numbers to Supabase** when messages are received
- **First-time user onboarding flow**: Automatically detects first-time users and initiates a 7-question onboarding conversation
- **Onboarding questions**: Collects user information (name, email, age, location, interests, occupation, referral source)
- **SKIP support**: Users can type "SKIP" to skip any question they don't want to answer
- **Progress tracking**: Tracks which question the user is on and saves all answers
- Shows partition assignments and warnings if not receiving all partitions
- Graceful shutdown on Ctrl+C

## Troubleshooting

**Missing Messages:** If you're only receiving some messages, check the partition assignment log. If you see a warning about not being the leader or missing partitions, either:
1. Stop all other consumer instances running with the same consumer group
2. Run with `USE_UNIQUE_GROUP=true npm start` to get all partitions

## Onboarding Flow

When a first-time user sends a message:

1. **Detection**: System detects it's a first-time user (no completed onboarding)
2. **Welcome Message**: Sends "Your first time user! Let's grab some info from you. What's your name?"
3. **7 Questions**: Asks 7 questions in sequence:
   - What's your name?
   - What's your email address?
   - What's your age?
   - What's your location?
   - What are your interests?
   - What's your occupation?
   - How did you hear about us?
4. **SKIP Support**: Users can type "SKIP" to skip any question
5. **Completion**: After all questions (or skips), sends "Thanks for completing the onboarding! We're all set."

All answers are saved to the `user_profile` table in Supabase.

## Output

The server will log:
- Chat ID
- Message text
- Sender phone number
- Sent timestamp
- Onboarding status and progress

Example output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 Message Received [Total: 1]
Chat ID: 1698665
Message: Hello
From: +19176256109
Sent At: 2025-12-05 14:42:05 -0600
[Partition: 0, Offset: 123]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 First-time user detected: +19176256109, starting onboarding
🚀 Started onboarding for +19176256109
```

