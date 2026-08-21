import { describe, it, expect } from 'vitest';

// Utility function tests for admin functionality
describe('Admin Utility Functions', () => {
  describe('formatCurrency', () => {
    const formatCurrency = (amount: number, currency = 'USD') => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(amount);
    };

    it('formats USD correctly', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(99.99)).toBe('$99.99');
    });

    it('handles large numbers', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });

    it('handles negative numbers', () => {
      expect(formatCurrency(-500)).toBe('-$500.00');
    });
  });

  describe('formatDate', () => {
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    it('formats dates correctly', () => {
      expect(formatDate('2026-05-15')).toBe('May 15, 2026');
      expect(formatDate('2026-01-01')).toBe('January 1, 2026');
    });
  });

  describe('Email validation', () => {
    const isValidEmail = (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('validates correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('Payment status mapping', () => {
    const getStatusIntent = (status: string) => {
      const statusMap: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
        paid: 'success',
        pending: 'warning',
        failed: 'error',
        refunded: 'neutral',
        cancelled: 'neutral',
      };
      return statusMap[status] || 'neutral';
    };

    it('maps payment statuses to intents', () => {
      expect(getStatusIntent('paid')).toBe('success');
      expect(getStatusIntent('pending')).toBe('warning');
      expect(getStatusIntent('failed')).toBe('error');
      expect(getStatusIntent('refunded')).toBe('neutral');
    });

    it('defaults to neutral for unknown status', () => {
      expect(getStatusIntent('unknown')).toBe('neutral');
    });
  });

  describe('Ticket type formatting', () => {
    const formatTicketType = (type: string) => {
      const typeMap: Record<string, string> = {
        ga: 'General Admission',
        vip: 'VIP',
        krewe: 'Crew',
        patron: 'Patron',
        comp: 'Complimentary',
      };
      return typeMap[type] || type.toUpperCase();
    };

    it('formats known ticket types', () => {
      expect(formatTicketType('ga')).toBe('General Admission');
      expect(formatTicketType('vip')).toBe('VIP');
      expect(formatTicketType('krewe')).toBe('Crew');
    });

    it('falls back to uppercase for unknown types', () => {
      expect(formatTicketType('custom')).toBe('CUSTOM');
    });
  });
});

describe('Admin Form Validation', () => {
  describe('Registration validation', () => {
    interface RegistrationData {
      email: string;
      firstName: string;
      lastName: string;
      ticketType: string;
    }

    const validateRegistration = (data: RegistrationData) => {
      const errors: Partial<Record<keyof RegistrationData, string>> = {};

      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = 'Valid email is required';
      }
      if (!data.firstName?.trim()) {
        errors.firstName = 'First name is required';
      }
      if (!data.lastName?.trim()) {
        errors.lastName = 'Last name is required';
      }
      if (!data.ticketType) {
        errors.ticketType = 'Ticket type is required';
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
      };
    };

    it('validates complete registration', () => {
      const result = validateRegistration({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        ticketType: 'ga',
      });

      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('catches missing email', () => {
      const result = validateRegistration({
        email: '',
        firstName: 'John',
        lastName: 'Doe',
        ticketType: 'ga',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBeDefined();
    });

    it('catches invalid email format', () => {
      const result = validateRegistration({
        email: 'not-valid',
        firstName: 'John',
        lastName: 'Doe',
        ticketType: 'ga',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBe('Valid email is required');
    });

    it('catches missing required fields', () => {
      const result = validateRegistration({
        email: 'test@example.com',
        firstName: '',
        lastName: '',
        ticketType: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.firstName).toBeDefined();
      expect(result.errors.lastName).toBeDefined();
      expect(result.errors.ticketType).toBeDefined();
    });
  });
});
