export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      checkout_attempts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          event_id: string
          id: string
          payment_intent_id: string | null
          provider: string
          provider_expires_at_seconds: number | null
          provider_request_version: number | null
          quantity: number
          reservation_id: string | null
          status: string
          ticket_type_id: string
          unit_price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          payment_intent_id?: string | null
          provider?: string
          provider_expires_at_seconds?: number | null
          provider_request_version?: number | null
          quantity: number
          reservation_id?: string | null
          status?: string
          ticket_type_id: string
          unit_price_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          payment_intent_id?: string | null
          provider?: string
          provider_expires_at_seconds?: number | null
          provider_request_version?: number | null
          quantity?: number
          reservation_id?: string | null
          status?: string
          ticket_type_id?: string
          unit_price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_attempts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_attempts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_attempts_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_expiry_recoveries: {
        Row: {
          amount_cents: number
          attempt_id: string
          currency: string
          event_id: string
          evidence_contract: string
          hold_expires_at: string
          observed_at: string
          owner_user_id: string
          provider_expires_at_seconds: number
          quantity: number
          recorded_at: string
          reservation_id: string
          ticket_type_id: string
          unit_price_cents: number
        }
        Insert: {
          amount_cents: number
          attempt_id: string
          currency: string
          event_id: string
          evidence_contract?: string
          hold_expires_at: string
          observed_at: string
          owner_user_id: string
          provider_expires_at_seconds: number
          quantity: number
          recorded_at?: string
          reservation_id: string
          ticket_type_id: string
          unit_price_cents: number
        }
        Update: {
          amount_cents?: number
          attempt_id?: string
          currency?: string
          event_id?: string
          evidence_contract?: string
          hold_expires_at?: string
          observed_at?: string
          owner_user_id?: string
          provider_expires_at_seconds?: number
          quantity?: number
          recorded_at?: string
          reservation_id?: string
          ticket_type_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkout_expiry_recoveries_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "checkout_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_expiry_recoveries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "inventory_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_memberships: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_memberships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_published: boolean
          name: string
          slug: string
          starts_at: string | null
          timezone: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          name: string
          slug: string
          starts_at?: string | null
          timezone?: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          name?: string
          slug?: string
          starts_at?: string | null
          timezone?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      inventory_reservations: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string
          id: string
          idempotency_key: string
          owner_user_id: string | null
          quantity: number
          released_at: string | null
          status: string
          ticket_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          idempotency_key: string
          owner_user_id?: string | null
          quantity: number
          released_at?: string | null
          status: string
          ticket_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          owner_user_id?: string | null
          quantity?: number
          released_at?: string | null
          status?: string
          ticket_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          ticket_type_id: string
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          ticket_type_id: string
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          ticket_type_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_email: string | null
          buyer_name: string | null
          checkout_attempt_id: string | null
          created_at: string
          currency: string
          event_id: string
          id: string
          status: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_name?: string | null
          checkout_attempt_id?: string | null
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string | null
          checkout_attempt_id?: string | null
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_checkout_attempt_id_fkey"
            columns: ["checkout_attempt_id"]
            isOneToOne: false
            referencedRelation: "checkout_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          checkout_attempt_id: string | null
          created_at: string
          event_type: string
          external_event_id: string
          failure_category: string | null
          id: string
          processed_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          checkout_attempt_id?: string | null
          created_at?: string
          event_type: string
          external_event_id: string
          failure_category?: string | null
          id?: string
          processed_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          checkout_attempt_id?: string | null
          created_at?: string
          event_type?: string
          external_event_id?: string
          failure_category?: string | null
          id?: string
          processed_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_checkout_attempt_id_fkey"
            columns: ["checkout_attempt_id"]
            isOneToOne: false
            referencedRelation: "checkout_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_ticket_transfers: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string
          id: string
          otp_issued_count: number
          otp_last_issued_at: string | null
          recipient_email: string | null
          recipient_user_id: string
          sender_user_id: string
          status: string
          ticket_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          otp_issued_count?: number
          otp_last_issued_at?: string | null
          recipient_email?: string | null
          recipient_user_id: string
          sender_user_id: string
          status?: string
          ticket_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_issued_count?: number
          otp_last_issued_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: string
          sender_user_id?: string
          status?: string
          ticket_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      refund_coordination_attempts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          payment_intent_id: string
          provider_refund_reference: string | null
          state: string
          ticket_count: number
          ticket_ids: string[]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          payment_intent_id: string
          provider_refund_reference?: string | null
          state?: string
          ticket_count: number
          ticket_ids: string[]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          payment_intent_id?: string
          provider_refund_reference?: string | null
          state?: string
          ticket_count?: number
          ticket_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      refund_ticket_claims: {
        Row: {
          coordination_attempt_id: string
          created_at: string
          ticket_id: string
        }
        Insert: {
          coordination_attempt_id: string
          created_at?: string
          ticket_id: string
        }
        Update: {
          coordination_attempt_id?: string
          created_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_ticket_claims_coordination_attempt_id_fkey"
            columns: ["coordination_attempt_id"]
            isOneToOne: false
            referencedRelation: "refund_coordination_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_check_in_reversals: {
        Row: {
          check_in_id: string
          created_at: string
          event_id: string
          id: string
          pass_id: string | null
          reason: string
          reversed_at: string
          staff_user_id: string
          ticket_id: string
        }
        Insert: {
          check_in_id: string
          created_at?: string
          event_id: string
          id?: string
          pass_id?: string | null
          reason: string
          reversed_at?: string
          staff_user_id: string
          ticket_id: string
        }
        Update: {
          check_in_id?: string
          created_at?: string
          event_id?: string
          id?: string
          pass_id?: string | null
          reason?: string
          reversed_at?: string
          staff_user_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_check_in_reversals_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: true
            referencedRelation: "ticket_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_check_in_reversals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_check_in_reversals_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "ticket_pass_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_check_in_reversals_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_check_ins: {
        Row: {
          checked_in_at: string
          created_at: string
          cycle: number
          event_id: string
          id: string
          outcome: string
          pass_id: string | null
          staff_user_id: string
          ticket_id: string
        }
        Insert: {
          checked_in_at?: string
          created_at?: string
          cycle?: number
          event_id: string
          id?: string
          outcome?: string
          pass_id?: string | null
          staff_user_id: string
          ticket_id: string
        }
        Update: {
          checked_in_at?: string
          created_at?: string
          cycle?: number
          event_id?: string
          id?: string
          outcome?: string
          pass_id?: string | null
          staff_user_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_check_ins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_check_ins_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "ticket_pass_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_check_ins_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_pass_codes: {
        Row: {
          code_digest: string
          created_at: string
          event_id: string
          id: string
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          code_digest: string
          created_at?: string
          event_id: string
          id?: string
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          code_digest?: string
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_pass_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_pass_codes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_refund_items: {
        Row: {
          created_at: string
          id: string
          refund_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          refund_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          refund_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "ticket_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_refund_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_refunds: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          event_id: string
          id: string
          order_id: string
          order_item_id: string | null
          payment_intent_id: string
          provider_refund_reference: string
          ticket_count: number
          ticket_type_id: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event_id: string
          id?: string
          order_id: string
          order_item_id?: string | null
          payment_intent_id: string
          provider_refund_reference: string
          ticket_count: number
          ticket_type_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event_id?: string
          id?: string
          order_id?: string
          order_item_id?: string | null
          payment_intent_id?: string
          provider_refund_reference?: string
          ticket_count?: number
          ticket_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_refunds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_refunds_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_refunds_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          is_refundable: boolean
          max_per_order: number
          name: string
          price_cents: number
          quantity_sold: number
          quantity_total: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          is_refundable?: boolean
          max_per_order?: number
          name: string
          price_cents?: number
          quantity_sold?: number
          quantity_total?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          is_refundable?: boolean
          max_per_order?: number
          name?: string
          price_cents?: number
          quantity_sold?: number
          quantity_total?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          created_at: string
          event_id: string
          holder_email: string | null
          holder_name: string | null
          id: string
          order_id: string
          order_item_id: string | null
          owner_user_id: string
          refundable_at_issue: boolean
          status: string
          ticket_type_id: string
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          event_id: string
          holder_email?: string | null
          holder_name?: string | null
          id?: string
          order_id: string
          order_item_id?: string | null
          owner_user_id: string
          refundable_at_issue?: boolean
          status?: string
          ticket_type_id: string
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          event_id?: string
          holder_email?: string | null
          holder_name?: string | null
          id?: string
          order_id?: string
          order_item_id?: string | null
          owner_user_id?: string
          refundable_at_issue?: boolean
          status?: string
          ticket_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_otp_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          redeemed_at: string | null
          requester_user_id: string
          ticket_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          requester_user_id: string
          ticket_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          requester_user_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_otp_codes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_expired_checkout_attempt: {
        Args: { p_attempt_id: string }
        Returns: {
          outcome: string
          released: number
        }[]
      }
      accept_ticket_transfer: {
        Args: {
          p_recipient_user_id: string
          p_token_hash: string
          p_transfer_id: string
        }
        Returns: {
          outcome: string
          ticket_id: string
        }[]
      }
      check_in_ticket: {
        Args: { p_code_digest: string; p_staff_user_id: string }
        Returns: {
          attended_at: string
          outcome: string
        }[]
      }
      confirm_ticket_inventory: {
        Args: { p_idempotency_key: string }
        Returns: {
          outcome: string
          reservation_id: string
        }[]
      }
      expire_ticket_inventory: {
        Args: never
        Returns: {
          outcome: string
          reservation_id: string
        }[]
      }
      finalize_paid_checkout_attempt: {
        Args: { p_attempt_id: string }
        Returns: {
          order_id: string
          outcome: string
          tickets_issued: number
        }[]
      }
      initiate_ticket_transfer: {
        Args: {
          p_expires_at: string
          p_recipient_user_id: string
          p_sender_user_id: string
          p_ticket_id: string
          p_token_hash: string
        }
        Returns: {
          outcome: string
          transfer_id: string
        }[]
      }
      prepare_owned_ticket_reservation: {
        Args: {
          p_idempotency_key: string
          p_owner_user_id: string
          p_quantity: number
          p_ticket_type_id: string
        }
        Returns: {
          expires_at: string
          outcome: string
          reservation_id: string
        }[]
      }
      read_owned_expiry_release_record: {
        Args: { p_owner_user_id: string; p_reservation_id: string }
        Returns: {
          outcome: string
        }[]
      }
      release_expired_orphan_reservation: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_quantity: number
          p_reservation_id: string
          p_ticket_type_id: string
        }
        Returns: {
          outcome: string
          released: number
        }[]
      }
      release_expired_v2_checkout_attempt: {
        Args: {
          p_amount_cents: number
          p_attempt_id: string
          p_currency: string
          p_event_id: string
          p_hold_expires_at: string
          p_observed_at: string
          p_observed_expires_at_seconds: number
          p_observed_intent_state: string
          p_observed_payment_status: string
          p_observed_status: string
          p_owner_user_id: string
          p_provider_expires_at_seconds: number
          p_quantity: number
          p_reservation_id: string
          p_ticket_type_id: string
          p_unit_price_cents: number
        }
        Returns: {
          outcome: string
          released: number
        }[]
      }
      release_owned_expired_v2_checkout_attempt: {
        Args: {
          p_amount_cents: number
          p_attempt_id: string
          p_currency: string
          p_event_id: string
          p_hold_expires_at: string
          p_observed_at: string
          p_observed_expires_at_seconds: number
          p_observed_intent_state: string
          p_observed_payment_status: string
          p_observed_status: string
          p_owner_user_id: string
          p_provider_expires_at_seconds: number
          p_quantity: number
          p_reservation_id: string
          p_ticket_type_id: string
          p_unit_price_cents: number
        }
        Returns: {
          outcome: string
          released: number
        }[]
      }
      release_ticket_inventory: {
        Args: { p_idempotency_key: string; p_reason: string }
        Returns: {
          outcome: string
          reservation_id: string
        }[]
      }
      replace_owner_ticket_pass: {
        Args: {
          p_expected_active_pass_id: string
          p_new_code_digest: string
          p_owner_user_id: string
          p_ticket_id: string
        }
        Returns: {
          outcome: string
          pass_id: string
        }[]
      }
      reserve_owned_ticket_inventory: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_owner_user_id: string
          p_quantity: number
          p_slug: string
        }
        Returns: {
          outcome: string
          reservation_id: string
        }[]
      }
      reserve_ticket_inventory: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_idempotency_key: string
          p_quantity: number
          p_slug: string
        }
        Returns: {
          outcome: string
          reservation_id: string
        }[]
      }
      reverse_refunded_tickets: {
        Args: {
          p_payment_intent_id: string
          p_provider_refund_reference: string
          p_ticket_ids: string[]
        }
        Returns: {
          outcome: string
          refund_id: string
          restocked: number
          tickets_reversed: number
        }[]
      }
      reverse_ticket_check_in: {
        Args: {
          p_code_digest: string
          p_reason: string
          p_staff_user_id: string
        }
        Returns: {
          outcome: string
          reversed_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
