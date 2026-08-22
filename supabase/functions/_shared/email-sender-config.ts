// Centralized email sender configuration
// Determines correct from/cc addresses based on email category and settings

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  getAlertEmail,
  getBrandName,
  getFromEmail,
  getMailDomain,
  getReplyToEmail,
} from "./operator-config.ts";

/**
 * Email category determines sender behavior:
 * - artist: Personal from the operator address, CC the pipeline inbox
 * - production: Configurable sender, CC the pipeline inbox
 * - guest: Personal from the operator address for welcome/personal emails
 * - guest_system: System no-reply address for automated guest notifications
 * - lodging: Same as guest for welcome, no-reply for system
 * - contract: Follows pipeline procedures (real email, CC the pipeline inbox)
 * - system: Automated notifications from the no-reply address
 * - alert: System alerts from OPERATOR_ALERT_EMAIL
 */
export type EmailCategory = 
  | 'artist'
  | 'production'
  | 'volunteer'
  | 'vendor'
  | 'artisan'
  | 'partner'
  | 'winery'
  | 'guest'
  | 'guest_system'
  | 'lodging'
  | 'lodging_system'
  | 'contract'
  | 'system'
  | 'alert';

export interface EmailSenderConfig {
  fromEmail: string;
  fromName: string;
  fromAddress: string; // Combined "Name <email>" format
  defaultCc: string[];
  replyTo?: string;
}

export interface EmailSettings {
  // Signatures
  signature_line: string;
  signature_name: string;
  
  // Artist pipeline
  artist_from_email: string;
  artist_from_name: string;
  artist_cc_emails: string[];
  
  // Talent/Production pipeline (legacy fields)
  talent_from_email: string;
  talent_from_name: string;
  production_from_email: string;
  production_from_name: string;
  
  // Guest emails
  guest_from_email: string;
  guest_from_name: string;
  
  // Other pipelines
  vendor_cc_emails: string[];
  artisan_cc_emails: string[];
  partner_cc_emails: string[];
  winery_from_email: string;
  winery_from_name: string;
  winery_cc_emails: string[];
  
  // System/Contract
  system_from_email: string;
  system_from_name: string;
  contract_from_email: string;
  contract_from_name: string;
  
  // Defaults
  default_cc_emails: string[];
}

// Default sender configurations (fallback if DB not available).
//
// No operator address is hardcoded. Everything below resolves from the
// runtime environment via _shared/operator-config.ts and fails closed to an
// empty string, in which case callers must skip sending rather than mail
// from somebody else's domain.
const FROM = getFromEmail();
const REPLY_TO = getReplyToEmail();
const ALERT = getAlertEmail();
const BRAND = getBrandName();
const MAIL_DOMAIN = getMailDomain();
const machine = (localPart: string) => (FROM ? `${localPart}@${MAIL_DOMAIN}` : "");

const DEFAULT_SENDERS: Record<EmailCategory, { email: string; name: string; replyTo?: string }> = {
  artist: { email: FROM, name: BRAND, replyTo: REPLY_TO },
  production: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  volunteer: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  vendor: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  artisan: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  partner: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  winery: { email: machine("team"), name: BRAND, replyTo: REPLY_TO },
  guest: { email: FROM, name: BRAND, replyTo: REPLY_TO },
  guest_system: { email: machine("noreply"), name: BRAND, replyTo: REPLY_TO },
  lodging: { email: FROM, name: BRAND, replyTo: REPLY_TO },
  lodging_system: { email: machine("noreply"), name: BRAND, replyTo: REPLY_TO },
  contract: { email: machine("contracts"), name: BRAND, replyTo: REPLY_TO },
  system: { email: machine("noreply"), name: BRAND, replyTo: REPLY_TO },
  alert: { email: ALERT || machine("noreply"), name: BRAND, replyTo: REPLY_TO },
};

// Default CC for pipeline emails (auto-added, can be removed in templates).
// Empty when OPERATOR_FROM_EMAIL / OPERATOR_MAIL_DOMAIN are unconfigured.
const PIPELINE_DEFAULT_CC = machine("inbox");

/**
 * Fetch email settings from database
 */
export async function fetchEmailSettings(): Promise<EmailSettings | null> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data, error } = await supabase
      .from('email_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    
    if (error || !data) {
      console.warn('[email-sender] Could not fetch settings, using defaults:', error?.message);
      return null;
    }
    
    return data as EmailSettings;
  } catch (err) {
    console.warn('[email-sender] Error fetching settings:', err);
    return null;
  }
}

/**
 * Get sender configuration for an email category
 */
export function getSenderConfig(
  category: EmailCategory,
  settings?: EmailSettings | null
): EmailSenderConfig {
  const defaults = DEFAULT_SENDERS[category];
  let fromEmail = defaults.email;
  let fromName = defaults.name;
  let defaultCc: string[] = [];
  
  if (settings) {
    // Get category-specific settings
    switch (category) {
      case 'artist':
        fromEmail = settings.artist_from_email || defaults.email;
        fromName = settings.artist_from_name || defaults.name;
        defaultCc = [...(settings.artist_cc_emails || [])];
        break;
        
      case 'production':
        fromEmail = settings.production_from_email || settings.talent_from_email || defaults.email;
        fromName = settings.production_from_name || settings.talent_from_name || defaults.name;
        // Production uses pipeline CC
        break;
        
      case 'volunteer':
        // Volunteer uses its own dedicated defaults (The Cosmico Team)
        break;
        
      case 'vendor':
        fromEmail = settings.production_from_email || defaults.email;
        fromName = settings.production_from_name || defaults.name;
        defaultCc = [...(settings.vendor_cc_emails || [])];
        break;
        
      case 'artisan':
        fromEmail = settings.production_from_email || defaults.email;
        fromName = settings.production_from_name || defaults.name;
        defaultCc = [...(settings.artisan_cc_emails || [])];
        break;
        
      case 'partner':
        fromEmail = settings.production_from_email || defaults.email;
        fromName = settings.production_from_name || defaults.name;
        defaultCc = [...(settings.partner_cc_emails || [])];
        break;
        
      case 'winery':
        fromEmail = settings.winery_from_email || defaults.email;
        fromName = settings.winery_from_name || defaults.name;
        defaultCc = [...(settings.winery_cc_emails || [])];
        break;
        
      case 'guest':
      case 'lodging':
        fromEmail = settings.guest_from_email || defaults.email;
        fromName = settings.guest_from_name || defaults.name;
        // Guest emails don't typically need CC but do get replyTo
        break;
      
      case 'guest_system':
      case 'lodging_system':
      case 'system':
        fromEmail = settings.system_from_email || defaults.email;
        fromName = settings.system_from_name || defaults.name;
        break;
        
      case 'contract':
        fromEmail = settings.contract_from_email || defaults.email;
        fromName = settings.contract_from_name || defaults.name;
        // Contract emails get pipeline CC
        break;
        
      case 'alert':
        // Alerts always use the hardcoded alert address
        break;
    }
  }
  
  // Ensure pipeline emails always CC the configured pipeline inbox (unless removed by template)
  const pipelineCategories: EmailCategory[] = ['artist', 'production', 'volunteer', 'vendor', 'artisan', 'partner', 'winery', 'contract'];
  if (PIPELINE_DEFAULT_CC && pipelineCategories.includes(category) && !defaultCc.includes(PIPELINE_DEFAULT_CC)) {
    defaultCc.push(PIPELINE_DEFAULT_CC);
  }
  
  // Deduplicate CC
  defaultCc = [...new Set(defaultCc)];
  
  return {
    fromEmail,
    fromName,
    fromAddress: `${fromName} <${fromEmail}>`,
    defaultCc,
    replyTo: defaults.replyTo,
  };
}

/**
 * Build the from address string
 */
export function buildFromAddress(name: string, email: string): string {
  return `${name} <${email}>`;
}

/**
 * Convenience function to get sender config with settings fetch
 */
export async function getEmailSenderConfig(category: EmailCategory): Promise<EmailSenderConfig> {
  const settings = await fetchEmailSettings();
  return getSenderConfig(category, settings);
}

/**
 * Maps legacy target types to email categories
 */
export function mapTargetTypeToCategory(targetType: string): EmailCategory {
  const mapping: Record<string, EmailCategory> = {
    artist: 'artist',
    vendor: 'vendor',
    artisan: 'artisan',
    partner: 'partner',
    winery: 'winery',
    volunteer: 'volunteer',
  };
  
  return mapping[targetType] || 'production';
}

/**
 * Determines if an email is "personal" (from a real person) vs "system" (automated)
 * Personal emails use the configured OPERATOR_FROM_EMAIL
 * System emails use the no-reply address on OPERATOR_MAIL_DOMAIN
 */
export function isPersonalEmail(category: EmailCategory): boolean {
  const personalCategories: EmailCategory[] = ['artist', 'guest', 'lodging'];
  return personalCategories.includes(category);
}
