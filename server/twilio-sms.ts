/**
 * Twilio SMS Integration
 * 
 * Uses Replit's Twilio connector for SMS authentication codes.
 * This is separate from LiveKit which handles voice.
 */

import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

/**
 * Send an SMS verification code
 */
export async function sendVerificationSMS(to: string, code: string): Promise<boolean> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    await client.messages.create({
      body: `Your Banter verification code is: ${code}`,
      from: fromNumber,
      to: to
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send SMS:', error.message);
    return false;
  }
}

/**
 * Send an instant "Join Now" alert SMS to a crew member
 */
export async function sendAlertSMS(to: string, joinLink: string): Promise<boolean> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    await client.messages.create({
      body: `Join Banter now! ${joinLink}`,
      from: fromNumber,
      to: to
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send alert SMS:', error.message);
    return false;
  }
}

/**
 * Send a reminder SMS for an upcoming scheduled banter
 */
export async function sendReminderSMS(to: string, banterName: string, minutesUntilStart: number, joinLink?: string): Promise<boolean> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    const timeText = minutesUntilStart <= 1 ? 'starting now' : `starting in ${minutesUntilStart} minutes`;
    const link = joinLink || `${process.env.REPLIT_DEPLOYMENT_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'your Banter link')}/mobley`;
    
    await client.messages.create({
      body: `Banter Reminder: "${banterName}" is ${timeText}. Join at ${link}`,
      from: fromNumber,
      to: to
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send reminder SMS:', error.message);
    return false;
  }
}
