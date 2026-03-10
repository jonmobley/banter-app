import { Resend } from 'resend';

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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    await client.emails.send({
      from: fromEmail,
      to: to,
      subject: 'Your Banter verification code',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981; margin-bottom: 20px;">Banter</h2>
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">Your verification code is:</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code expires in 5 minutes.</p>
        </div>
      `
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send email:', error.message);
    return false;
  }
}

export async function sendAlertEmail(to: string, joinLink: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    await client.emails.send({
      from: fromEmail,
      to: to,
      subject: 'Join Banter now!',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981; margin-bottom: 20px;">Banter</h2>
          <p style="color: #374151; font-size: 16px; margin-bottom: 20px;">You're invited to join a Banter call right now!</p>
          <a href="${joinLink}" style="display: inline-block; background: #10b981; color: white; font-weight: 600; padding: 14px 28px; border-radius: 9999px; text-decoration: none; font-size: 16px;">Join Banter</a>
          <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Or open this link: ${joinLink}</p>
        </div>
      `
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send alert email:', error.message);
    return false;
  }
}

export async function sendReminderEmail(to: string, banterName: string, minutesUntilStart: number, joinLink?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const timeText = minutesUntilStart <= 1 ? 'starting now' : `starting in ${minutesUntilStart} minutes`;
    const linkText = joinLink || 'your Banter link';
    
    await client.emails.send({
      from: fromEmail,
      to: to,
      subject: `Banter Reminder: "${banterName}" is ${timeText}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #10b981; margin-bottom: 20px;">Banter</h2>
          <p style="color: #374151; font-size: 16px; margin-bottom: 8px;"><strong>"${banterName}"</strong> is ${timeText}.</p>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 20px;">Don't miss it — join now or when the call begins.</p>
          ${joinLink ? `<a href="${joinLink}" style="display: inline-block; background: #10b981; color: white; font-weight: 600; padding: 14px 28px; border-radius: 9999px; text-decoration: none; font-size: 16px;">Join Banter</a>` : ''}
          ${joinLink ? `<p style="color: #6b7280; font-size: 14px; margin-top: 20px;">Or open this link: ${linkText}</p>` : ''}
        </div>
      `
    });
    
    return true;
  } catch (error: any) {
    console.error('Failed to send reminder email:', error.message);
    return false;
  }
}
