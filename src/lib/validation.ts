import { z } from 'zod';

/**
 * Shared form validation schemas
 * 
 * These schemas provide consistent validation across all forms,
 * with user-friendly error messages and security-focused constraints.
 */

// ============ PRIMITIVE SCHEMAS ============

/**
 * Email validation with trimming and normalization
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(255, 'Email must be less than 255 characters')
  .email('Please enter a valid email address')
  .transform((email) => email.toLowerCase());

/**
 * Name validation (person name)
 */
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters')
  .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

/**
 * Flexible name schema (allows more characters for business names)
 */
export const flexibleNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(200, 'Name must be less than 200 characters');

/**
 * Phone number validation (flexible format)
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Phone number must be at least 10 digits')
  .max(20, 'Phone number must be less than 20 characters')
  .regex(/^[\d\s\-\+\(\)]+$/, 'Please enter a valid phone number')
  .optional()
  .or(z.literal(''));

/**
 * URL validation
 */
export const urlSchema = z
  .string()
  .trim()
  .url('Please enter a valid URL')
  .max(2000, 'URL must be less than 2000 characters')
  .optional()
  .or(z.literal(''));

/**
 * Message/text area validation
 */
export const messageSchema = z
  .string()
  .trim()
  .min(1, 'Message is required')
  .max(5000, 'Message must be less than 5000 characters');

/**
 * Short text input validation
 */
export const shortTextSchema = z
  .string()
  .trim()
  .max(500, 'Text must be less than 500 characters');

/**
 * Positive integer validation
 */
export const positiveIntSchema = z
  .number()
  .int('Must be a whole number')
  .positive('Must be a positive number');

/**
 * Quantity validation (1-99)
 */
export const quantitySchema = z
  .number()
  .int('Must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(99, 'Quantity cannot exceed 99');

/**
 * Currency amount validation (in cents)
 */
export const amountCentsSchema = z
  .number()
  .int('Amount must be a whole number of cents')
  .min(0, 'Amount cannot be negative')
  .max(100000000, 'Amount exceeds maximum'); // $1M limit

// ============ COMPOSITE SCHEMAS ============

/**
 * Contact form schema
 */
export const contactFormSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  message: messageSchema,
});

/**
 * Newsletter/waitlist signup schema
 */
export const emailSignupSchema = z.object({
  email: emailSchema,
  name: flexibleNameSchema.optional(),
});

/**
 * Basic registration schema
 */
export const registrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
});

/**
 * Ticket checkout schema
 */
export const ticketCheckoutSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  ticketType: z.string().min(1, 'Please select a ticket type'),
  quantity: quantitySchema,
  donationAmount: z.number().min(0).max(100000).optional(),
});

/**
 * Support message schema
 */
export const supportMessageSchema = z.object({
  name: flexibleNameSchema,
  email: emailSchema,
  message: messageSchema,
  subject: shortTextSchema.optional(),
});

// ============ UTILITY FUNCTIONS ============

/**
 * Safely parse and validate input, returning result with success indicator
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Extract first error message from Zod error
 */
export function getFirstError(error: z.ZodError): string {
  const firstError = error.errors[0];
  return firstError?.message || 'Validation failed';
}

/**
 * Format Zod errors as a field -> message map
 */
export function formatErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const err of error.errors) {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  }
  return errors;
}

/**
 * Sanitize user input for safe display
 * Removes potential XSS vectors
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and encode input for use in URLs
 */
export function safeEncodeURIComponent(input: string, maxLength: number = 500): string {
  const sanitized = input.trim().slice(0, maxLength);
  return encodeURIComponent(sanitized);
}

export type ContactFormData = z.infer<typeof contactFormSchema>;
export type EmailSignupData = z.infer<typeof emailSignupSchema>;
export type RegistrationData = z.infer<typeof registrationSchema>;
export type TicketCheckoutData = z.infer<typeof ticketCheckoutSchema>;
export type SupportMessageData = z.infer<typeof supportMessageSchema>;
