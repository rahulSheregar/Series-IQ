const cron = require('node-cron');
const { getUsersForDailyUpdates, hasBeenAskedToday, requestDailyUpdate } = require('./daily-updates-service');

let cronJob = null;

/**
 * Start the cron job to send daily update requests
 * @param {string} schedule - Cron schedule (default: every 5 minutes)
 */
function startDailyUpdateCron(schedule = '*/1 * * * *') {
    if (cronJob) {
        console.log('⚠️  Cron job already running');
        return;
    }

    console.log(`🕐 Starting daily update cron job (schedule: ${schedule})`);

    cronJob = cron.schedule(schedule, async () => {
        try {
            console.log('\n📅 Running daily update cron job...');
            
            // Get all users who have completed onboarding
            const users = await getUsersForDailyUpdates();
            console.log(`📊 Found ${users.length} users eligible for daily updates`);

            let requested = 0;
            let skipped = 0;
            let errors = 0;

            // Process users in batches to avoid overwhelming the system
            for (const user of users) {
                try {
                    // Check if already asked today
                    const alreadyAsked = await hasBeenAskedToday(user.phone_number);
                    
                    if (alreadyAsked) {
                        skipped++;
                        continue;
                    }

                    // Request update
                    await requestDailyUpdate(user.phone_number, user.last_chat_id);
                    requested++;
                    
                    // Small delay between requests to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`❌ Error requesting update for ${user.phone_number}:`, error.message);
                    errors++;
                }
            }

            console.log(`✅ Cron job completed: ${requested} requested, ${skipped} skipped, ${errors} errors\n`);
        } catch (error) {
            console.error('❌ Error in daily update cron job:', error);
        }
    }, {
        scheduled: true,
        timezone: 'America/New_York' // Adjust timezone as needed
    });

    console.log('✅ Daily update cron job started');
}

/**
 * Stop the cron job
 */
function stopDailyUpdateCron() {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('🛑 Daily update cron job stopped');
    }
}

module.exports = {
    startDailyUpdateCron,
    stopDailyUpdateCron
};

