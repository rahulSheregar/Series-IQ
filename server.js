require('dotenv').config();
const { Kafka } = require('kafkajs');
const { saveUserProfile } = require('./supabase');
const { getUserProfile, startOnboarding, processOnboardingAnswer, isInOnboarding } = require('./onboarding');
const { testConnection } = require('./series-api');

// Kafka Configuration from environment variables
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'team-client-d3cd502131d1487ead773f84bbc9e8b7',
  brokers: (process.env.KAFKA_BROKERS || 'pkc-619z3.us-east1.gcp.confluent.cloud:9092').split(','),
  ssl: process.env.KAFKA_SSL !== 'false', // Default to true
  sasl: {
    mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
    username: process.env.KAFKA_USERNAME || '',
    password: process.env.KAFKA_PASSWORD || ''
  }
});

// Use unique consumer group by default to ensure we get all partitions
// Set USE_SHARED_GROUP=true to use the shared consumer group (for production with multiple consumers)
const useSharedGroup = process.env.USE_SHARED_GROUP === 'true';
const baseConsumerGroupId = process.env.KAFKA_CONSUMER_GROUP_ID || 'team-cg-d3cd502131d1487ead773f84bbc9e8b7';
const consumerGroupId = useSharedGroup
  ? baseConsumerGroupId
  : `${baseConsumerGroupId}-${Date.now()}`;

// Set READ_FROM_BEGINNING=true to read all messages from the start (useful for catching up)
const readFromBeginning = process.env.READ_FROM_BEGINNING === 'true';

if (!useSharedGroup) {
  console.log('ℹ️  Using unique consumer group to receive all partitions');
  console.log(`Consumer Group: ${consumerGroupId}`);
} else {
  console.log('ℹ️  Using shared consumer group (partitions may be distributed)');
}

if (readFromBeginning) {
  console.log('ℹ️  Will read from beginning of topic (may receive old messages)');
}

const consumer = kafka.consumer({
  groupId: consumerGroupId
});

const topic = process.env.KAFKA_TOPIC || 'team.team.d3cd502131d1487ead773f84bbc9e8b7';

// Track message counts per partition
const messageCounts = { 0: 0, 1: 0, 2: 0 };
// Track last offset seen per partition to detect gaps
const lastOffsets = { 0: null, 1: null, 2: null };
let totalMessages = 0;

async function startServer() {
  try {
    // Test Series API connection
    console.log('Testing Series API connection...');
    await testConnection();
    console.log('');

    console.log('Connecting to Kafka...');
    await consumer.connect();
    console.log('Connected to Kafka successfully!');

    await consumer.subscribe({
      topic: topic,
      fromBeginning: readFromBeginning // Start from beginning if env var is set, otherwise from latest
    });

    console.log(`Listening to topic: ${topic}`);
    console.log('Waiting for messages... (Press Ctrl+C to stop)\n');
    if (!readFromBeginning) {
      console.log('ℹ️  Note: Only messages sent AFTER this consumer starts will be received.');
      console.log('ℹ️  To read from beginning, set READ_FROM_BEGINNING=true\n');
    } else {
      console.log('ℹ️  Reading from beginning - may receive historical messages\n');
    }

    // Add heartbeat to show consumer is alive and message counts
    setInterval(() => {
      const offsetInfo = Object.entries(lastOffsets)
        .map(([p, offset]) => `P${p}:${offset !== null ? offset : 'none'}`)
        .join(', ');
      console.log(`💓 Consumer heartbeat - Total: ${totalMessages} | Counts (P0:${messageCounts[0]}, P1:${messageCounts[1]}, P2:${messageCounts[2]}) | Last Offsets (${offsetInfo})`);
    }, 30000); // Every 30 seconds

    // Log partition assignments
    consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
      console.log('\n📊 Consumer Group Assignment:');
      console.log('Member ID:', payload.memberId);
      console.log('Leader ID:', payload.leaderId);
      console.log('Is Leader:', payload.isLeader);

      const assignedPartitions = payload.memberAssignment[topic] || [];
      console.log(`Assigned Partitions for ${topic}:`, assignedPartitions);

      if (!payload.isLeader && assignedPartitions.length < 3) {
        console.log('\n⚠️  WARNING: You are not the leader and may not receive all partitions!');
        console.log('⚠️  Missing messages might be in partitions assigned to other consumers.');
        console.log('⚠️  Solution: Stop all other consumer instances, or run with USE_UNIQUE_GROUP=true\n');
      } else if (assignedPartitions.length === 3) {
        console.log('✅ All partitions assigned (0, 1, 2)');
        console.log('⚠️  IMPORTANT: Kafka routes messages to partitions based on a partition key.');
        console.log('⚠️  If Series API uses chat_id or phone_number as the key, messages from the same chat');
        console.log('⚠️  will always go to the same partition. Check if missing messages are in P0 or P1.\n');
      }
      console.log('');
    });

    await consumer.run({
      eachBatch: async ({ batch }) => {
        // Log batch info for debugging
        const partition = batch.partition;
        const messageCount = batch.messages.length;
        if (messageCount > 0) {
          const firstOffset = batch.messages[0].offset;
          const lastOffset = batch.messages[batch.messages.length - 1].offset;
          console.log(`📦 Batch: ${messageCount} msg(s) from P${partition} (offsets ${firstOffset}-${lastOffset})`);
        }
      },
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const currentOffset = parseInt(message.offset);

          // Detect offset gaps
          if (lastOffsets[partition] !== null) {
            const expectedOffset = lastOffsets[partition] + 1;
            if (currentOffset !== expectedOffset) {
              const gap = currentOffset - expectedOffset;
              console.log(`⚠️  OFFSET GAP DETECTED on Partition ${partition}!`);
              console.log(`   Last offset: ${lastOffsets[partition]}, Current: ${currentOffset}`);
              console.log(`   Missing ${gap} message(s) (offsets ${expectedOffset} to ${currentOffset - 1})`);
              console.log(`   These messages may be in a different partition or were not published to Kafka.\n`);
            }
          }

          // Update last offset
          lastOffsets[partition] = currentOffset;

          // Track message counts
          messageCounts[partition] = (messageCounts[partition] || 0) + 1;
          totalMessages++;

          // Parse the message value as JSON
          const rawValue = message.value.toString();
          const event = JSON.parse(rawValue);

          // Log ALL messages received for debugging
          console.log(`🔔 Received event: ${event.event_type} [P${partition}, Offset: ${currentOffset}]`);

          // Check if it's a message.received event
          if (event.event_type === 'message.received' && event.data) {
            const chatId = event.data.chat_id ? parseInt(event.data.chat_id) : null;
            const messageText = event.data.text || '(no text)';
            const phoneNumber = event.data.from_phone;

            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📨 Message Received [Total: ${totalMessages}]`);
            console.log(`Chat ID: ${chatId}`);
            console.log(`Message: ${messageText}`);
            console.log(`From: ${phoneNumber || 'Unknown'}`);
            console.log(`Sent At: ${event.data.sent_at || 'Unknown'}`);
            console.log(`[Partition: ${partition}, Offset: ${currentOffset}]`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Handle user onboarding flow
            if (phoneNumber) {
              try {
                // First, ensure user profile exists
                const result = await saveUserProfile(phoneNumber);
                if (result.isNew) {
                  console.log(`💾 New user profile saved: ${phoneNumber}`);
                }

                // Get user profile to check onboarding status
                const userProfile = await getUserProfile(phoneNumber);

                if (!userProfile) {
                  console.error(`❌ Could not retrieve user profile for ${phoneNumber}`);
                  return; // Exit early from this message handler
                }

                // Check if user is in onboarding flow
                const inOnboarding = await isInOnboarding(phoneNumber);

                if (inOnboarding) {
                  // User is answering onboarding questions
                  console.log(`📝 Processing onboarding answer for ${phoneNumber}`);
                  await processOnboardingAnswer(phoneNumber, messageText, chatId);
                } else if (!userProfile.onboarding_completed) {
                  // First-time user, start onboarding
                  console.log(`🎯 First-time user detected: ${phoneNumber}, starting onboarding`);
                  await startOnboarding(phoneNumber, chatId);
                } else {
                  // User has completed onboarding, handle normally
                  console.log(`✅ User ${phoneNumber} has completed onboarding`);
                  // Add your normal message handling logic here
                }
              } catch (error) {
                console.error(`❌ Error handling message for ${phoneNumber}:`, error.message);
                console.error(error.stack);
              }
            }
          } else if (event.event_type === 'typing_indicator.received') {
            console.log(`⌨️  Typing indicator received for Chat ID: ${event.data?.chat_id || 'N/A'} [Partition: ${partition}, Offset: ${currentOffset}]\n`);
          } else if (event.event_type === 'typing_indicator.removed') {
            console.log(`⌨️  Typing indicator stopped for Chat ID: ${event.data?.chat_id || 'N/A'} [Partition: ${partition}, Offset: ${currentOffset}]\n`);
          } else {
            // Log other event types with full details
            console.log(`📋 Event: ${event.event_type} (Chat ID: ${event.data?.chat_id || 'N/A'}) [Partition: ${partition}, Offset: ${currentOffset}]`);
            console.log(`   Full event: ${JSON.stringify(event, null, 2)}\n`);
          }
        } catch (error) {
          console.error(`❌ Error parsing message from partition ${partition}, offset ${message.offset}:`, error.message);
          console.log('Raw message value:', message.value?.toString() || 'No value');
          console.log('');
        }
      }
    });
  } catch (error) {
    console.error('Error in Kafka consumer:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

// Start the server
startServer().catch(console.error);

