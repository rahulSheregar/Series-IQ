const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
// For server-side operations, use SUPABASE_SECRET_KEY (new API keys) or SUPABASE_ANON_KEY (legacy)
// The secret key bypasses RLS and is recommended for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set SUPABASE_URL and either ' +
    'SUPABASE_SECRET_KEY (new API keys) or SUPABASE_ANON_KEY (legacy) in your .env file'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Save or update user profile with phone number
 * @param {string} phoneNumber - The phone number to save
 * @returns {Promise<Object>} - The saved user profile
 */
async function saveUserProfile(phoneNumber) {
  try {
    // First, check if user with this phone number already exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('user_profile')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking existing user:', fetchError);
      throw fetchError;
    }

    if (existingUser) {
      // User exists, return existing profile
      console.log(`✅ User profile already exists for phone: ${phoneNumber}`);
      return { data: existingUser, isNew: false };
    }

    // User doesn't exist, create new profile
    const { data, error } = await supabase
      .from('user_profile')
      .insert([
        {
          phone_number: phoneNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error saving user profile:', error);
      throw error;
    }

    console.log(`✅ Saved new user profile for phone: ${phoneNumber}`);
    return { data, isNew: true };
  } catch (error) {
    console.error('Error in saveUserProfile:', error);
    throw error;
  }
}

module.exports = {
  supabase,
  saveUserProfile
};

