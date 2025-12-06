# Kafka Message Listener Server

A Node.js server that listens to the Kafka topic and logs incoming messages with their chat_id.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Supabase:
   - Follow the instructions in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
   - Create a `.env` file with your Supabase credentials:
     ```env
     SUPABASE_URL=your_supabase_project_url
     SUPABASE_ANON_KEY=your_supabase_anon_key
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
- Shows partition assignments and warnings if not receiving all partitions
- Graceful shutdown on Ctrl+C

## Troubleshooting

**Missing Messages:** If you're only receiving some messages, check the partition assignment log. If you see a warning about not being the leader or missing partitions, either:
1. Stop all other consumer instances running with the same consumer group
2. Run with `USE_UNIQUE_GROUP=true npm start` to get all partitions

## Output

The server will log:
- Chat ID
- Message text
- Sender phone number
- Sent timestamp

Example output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 Message Received
Chat ID: 1698665
Message: Fianko just posted.
From: +19176256109
Sent At: 2025-12-05 14:42:05 -0600
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

