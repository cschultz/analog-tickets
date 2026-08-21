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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accommodation_units: {
        Row: {
          bed_configuration: string
          beds_total: number
          class_from_wildhaven: string | null
          created_at: string
          has_loft: boolean
          id: string
          inventory_status: Database["public"]["Enums"]["accommodation_inventory_status"]
          is_family_style: boolean
          night_price: number
          notes: string | null
          product_type: Database["public"]["Enums"]["accommodation_product_type"]
          sleeps_max: number
          stripe_price_id: string | null
          unit_name: string
          updated_at: string
          zone_key: string
        }
        Insert: {
          bed_configuration: string
          beds_total?: number
          class_from_wildhaven?: string | null
          created_at?: string
          has_loft?: boolean
          id?: string
          inventory_status?: Database["public"]["Enums"]["accommodation_inventory_status"]
          is_family_style?: boolean
          night_price?: number
          notes?: string | null
          product_type: Database["public"]["Enums"]["accommodation_product_type"]
          sleeps_max?: number
          stripe_price_id?: string | null
          unit_name: string
          updated_at?: string
          zone_key: string
        }
        Update: {
          bed_configuration?: string
          beds_total?: number
          class_from_wildhaven?: string | null
          created_at?: string
          has_loft?: boolean
          id?: string
          inventory_status?: Database["public"]["Enums"]["accommodation_inventory_status"]
          is_family_style?: boolean
          night_price?: number
          notes?: string | null
          product_type?: Database["public"]["Enums"]["accommodation_product_type"]
          sleeps_max?: number
          stripe_price_id?: string | null
          unit_name?: string
          updated_at?: string
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_units_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "accommodation_zones"
            referencedColumns: ["zone_key"]
          },
        ]
      }
      accommodation_waitlist: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          notified_at: string | null
          registration_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          name: string
          notified_at?: string | null
          registration_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          notified_at?: string | null
          registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "accommodation_waitlist_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_zones: {
        Row: {
          created_at: string
          description: string | null
          id: string
          inventory_available: number
          inventory_total: number
          is_publicly_available: boolean
          min_required_tickets: number | null
          night_price: number
          required_ticket_types: string[] | null
          sleeps_max: number
          sleeps_min: number
          sound_level: string
          stripe_price_id: string | null
          updated_at: string
          zone_key: string
          zone_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          inventory_available?: number
          inventory_total?: number
          is_publicly_available?: boolean
          min_required_tickets?: number | null
          night_price?: number
          required_ticket_types?: string[] | null
          sleeps_max?: number
          sleeps_min?: number
          sound_level: string
          stripe_price_id?: string | null
          updated_at?: string
          zone_key: string
          zone_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          inventory_available?: number
          inventory_total?: number
          is_publicly_available?: boolean
          min_required_tickets?: number | null
          night_price?: number
          required_ticket_types?: string[] | null
          sleeps_max?: number
          sleeps_min?: number
          sound_level?: string
          stripe_price_id?: string | null
          updated_at?: string
          zone_key?: string
          zone_name?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          details: Json | null
          entity_id: string
          entity_name: string | null
          entity_type: string
          event_id: string | null
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          entity_id: string
          entity_name?: string | null
          entity_type: string
          event_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          details?: Json | null
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          event_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      addon_audit_discrepancies: {
        Row: {
          addonish_lines: Json
          audit_run_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          existing_addon_rows: number
          id: string
          missing: boolean
          notes: string | null
          order_number: string | null
          registration_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          stripe_session_id: string
        }
        Insert: {
          addonish_lines?: Json
          audit_run_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          existing_addon_rows?: number
          id?: string
          missing?: boolean
          notes?: string | null
          order_number?: string | null
          registration_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          stripe_session_id: string
        }
        Update: {
          addonish_lines?: Json
          audit_run_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          existing_addon_rows?: number
          id?: string
          missing?: boolean
          notes?: string | null
          order_number?: string | null
          registration_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          stripe_session_id?: string
        }
        Relationships: []
      }
      addon_inventory: {
        Row: {
          addon_type: string
          created_at: string | null
          description: string | null
          display_name: string
          event_id: string | null
          id: string
          is_active: boolean
          is_publicly_available: boolean
          price: number
          required_ticket_types: string[] | null
          sales_end_at: string | null
          sold_quantity: number
          total_quantity: number
          updated_at: string | null
        }
        Insert: {
          addon_type: string
          created_at?: string | null
          description?: string | null
          display_name: string
          event_id?: string | null
          id?: string
          is_active?: boolean
          is_publicly_available?: boolean
          price?: number
          required_ticket_types?: string[] | null
          sales_end_at?: string | null
          sold_quantity?: number
          total_quantity: number
          updated_at?: string | null
        }
        Update: {
          addon_type?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          event_id?: string | null
          id?: string
          is_active?: boolean
          is_publicly_available?: boolean
          price?: number
          required_ticket_types?: string[] | null
          sales_end_at?: string | null
          sold_quantity?: number
          total_quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      addon_purchases: {
        Row: {
          created_at: string
          dietary_restrictions: string | null
          has_dietary_restrictions: boolean
          id: string
          inventory_id: string
          payment_status: string
          purchase_type: string
          purchaser_email: string
          quantity: number
          registration_id: string
          stripe_session_id: string | null
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dietary_restrictions?: string | null
          has_dietary_restrictions?: boolean
          id?: string
          inventory_id: string
          payment_status?: string
          purchase_type: string
          purchaser_email: string
          quantity?: number
          registration_id: string
          stripe_session_id?: string | null
          total_amount: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dietary_restrictions?: string | null
          has_dietary_restrictions?: boolean
          id?: string
          inventory_id?: string
          payment_status?: string
          purchase_type?: string
          purchaser_email?: string
          quantity?: number
          registration_id?: string
          stripe_session_id?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_purchases_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "addon_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_purchases_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_redemptions: {
        Row: {
          addon_purchase_id: string
          addon_type: string
          client_event_id: string | null
          created_at: string
          id: string
          redeemed_at: string
          registration_id: string | null
          session_id: string | null
          station_label: string | null
          unit_index: number
        }
        Insert: {
          addon_purchase_id: string
          addon_type: string
          client_event_id?: string | null
          created_at?: string
          id?: string
          redeemed_at?: string
          registration_id?: string | null
          session_id?: string | null
          station_label?: string | null
          unit_index: number
        }
        Update: {
          addon_purchase_id?: string
          addon_type?: string
          client_event_id?: string | null
          created_at?: string
          id?: string
          redeemed_at?: string
          registration_id?: string | null
          session_id?: string | null
          station_label?: string | null
          unit_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "addon_redemptions_addon_purchase_id_fkey"
            columns: ["addon_purchase_id"]
            isOneToOne: false
            referencedRelation: "addon_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_redemptions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_redemptions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "box_office_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string | null
          admin_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_email_aliases: {
        Row: {
          admin_user_id: string
          created_at: string | null
          email: string
          id: string
          is_primary: boolean | null
          updated_at: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string | null
          email: string
          id?: string
          is_primary?: boolean | null
          updated_at?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string | null
          email?: string
          id?: string
          is_primary?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          name: string | null
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          name?: string | null
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          name?: string | null
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      alert_throttle: {
        Row: {
          alert_key: string
          last_sent_at: string
          payload: Json | null
        }
        Insert: {
          alert_key: string
          last_sent_at?: string
          payload?: Json | null
        }
        Update: {
          alert_key?: string
          last_sent_at?: string
          payload?: Json | null
        }
        Relationships: []
      }
      artisan_contacts: {
        Row: {
          artisan_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          artisan_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          artisan_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artisan_contacts_artisan_id_fkey"
            columns: ["artisan_id"]
            isOneToOne: false
            referencedRelation: "artisans"
            referencedColumns: ["id"]
          },
        ]
      }
      artisan_contracts: {
        Row: {
          amount: number | null
          artisan_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          notes: string | null
          sent_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["artisan_contract_status"]
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          artisan_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["artisan_contract_status"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          artisan_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["artisan_contract_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artisan_contracts_artisan_id_fkey"
            columns: ["artisan_id"]
            isOneToOne: false
            referencedRelation: "artisans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artisan_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artisan_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      artisan_documents: {
        Row: {
          artisan_id: string
          contract_id: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["artisan_document_type"]
          expiration_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          artisan_id: string
          contract_id?: string | null
          created_at?: string
          document_type: Database["public"]["Enums"]["artisan_document_type"]
          expiration_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          artisan_id?: string
          contract_id?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["artisan_document_type"]
          expiration_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artisan_documents_artisan_id_fkey"
            columns: ["artisan_id"]
            isOneToOne: false
            referencedRelation: "artisans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artisan_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "artisan_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artisan_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artisans: {
        Row: {
          booth_fee: number | null
          booth_number: string | null
          business_name: string | null
          craft_type: string | null
          created_at: string
          custom_fields: Json | null
          deal_value: number | null
          email: string | null
          event_id: string | null
          id: string
          instagram_url: string | null
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status"] | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          booth_fee?: number | null
          booth_number?: string | null
          business_name?: string | null
          craft_type?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          instagram_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          booth_fee?: number | null
          booth_number?: string | null
          business_name?: string | null
          craft_type?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          instagram_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artisans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artisans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      artist_assets: {
        Row: {
          artist_id: string
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          source_email_id: string | null
          source_type: string
          source_url: string | null
          thumbnail_path: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          source_email_id?: string | null
          source_type?: string
          source_url?: string | null
          thumbnail_path?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          source_email_id?: string | null
          source_type?: string
          source_url?: string | null
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_assets_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_contacts: {
        Row: {
          artist_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["artist_contact_role"]
          role_notes: string | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["artist_contact_role"]
          role_notes?: string | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["artist_contact_role"]
          role_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_contacts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_documents: {
        Row: {
          artist_id: string
          contract_id: string | null
          created_at: string
          document_type: string
          expiration_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          artist_id: string
          contract_id?: string | null
          created_at?: string
          document_type?: string
          expiration_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          artist_id?: string
          contract_id?: string | null
          created_at?: string
          document_type?: string
          expiration_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_documents_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_email_attachments: {
        Row: {
          created_at: string
          email_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
        }
        Insert: {
          created_at?: string
          email_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Update: {
          created_at?: string
          email_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "artist_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_email_recipients: {
        Row: {
          artist_id: string
          click_count: number | null
          clicked_at: string | null
          contact_id: string
          created_at: string
          email_id: string
          error_message: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          sent_at: string | null
          status: string
          tracking_id: string | null
        }
        Insert: {
          artist_id: string
          click_count?: number | null
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          email_id: string
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          tracking_id?: string | null
        }
        Update: {
          artist_id?: string
          click_count?: number | null
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          email_id?: string
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_email_recipients_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_email_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "artist_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_email_recipients_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "artist_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_email_replies: {
        Row: {
          artist_id: string | null
          body_html: string | null
          body_text: string | null
          created_at: string
          from_email: string
          from_name: string | null
          id: string
          is_read: boolean | null
          original_email_id: string | null
          raw_payload: Json | null
          received_at: string
          resend_email_id: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          artist_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          original_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          resend_email_id?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          artist_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          original_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          resend_email_id?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_email_replies_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_email_replies_original_email_id_fkey"
            columns: ["original_email_id"]
            isOneToOne: false
            referencedRelation: "artist_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_email_templates: {
        Row: {
          audience: string | null
          body_html: string
          category: Database["public"]["Enums"]["artist_email_category"]
          created_at: string
          created_by: string | null
          email_format: string
          event_id: string | null
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          body_html: string
          category?: Database["public"]["Enums"]["artist_email_category"]
          created_at?: string
          created_by?: string | null
          email_format?: string
          event_id?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          body_html?: string
          category?: Database["public"]["Enums"]["artist_email_category"]
          created_at?: string
          created_by?: string | null
          email_format?: string
          event_id?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_email_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_email_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      artist_emails: {
        Row: {
          body_html: string
          created_at: string
          event_id: string
          id: string
          sent_at: string
          sent_by: string | null
          subject: string
          target_roles:
            | Database["public"]["Enums"]["artist_contact_role"][]
            | null
          template_id: string | null
        }
        Insert: {
          body_html: string
          created_at?: string
          event_id: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          subject: string
          target_roles?:
            | Database["public"]["Enums"]["artist_contact_role"][]
            | null
          template_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          event_id?: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          subject?: string
          target_roles?:
            | Database["public"]["Enums"]["artist_contact_role"][]
            | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "artist_emails_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "artist_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_offers: {
        Row: {
          accepted_at: string | null
          additional_perks: string | null
          ages: string | null
          artist_id: string | null
          artist_name: string
          capacity: number | null
          city: string | null
          created_at: string
          created_by: string | null
          declined_at: string | null
          deposit_notes: string | null
          deposit_percentage: number | null
          event_id: string | null
          expiration_date: string | null
          guest_list_count: number | null
          guest_list_notes: string | null
          id: string
          indoor_outdoor: string | null
          merchandise_terms: string | null
          offer_amount: number | null
          offer_currency: string | null
          other_terms: string | null
          others_on_lineup: string | null
          past_lineup_url: string | null
          performance_date: string | null
          radius_clause: string | null
          radius_days: number | null
          radius_miles: number | null
          raw_offer_text: string | null
          sent_at: string | null
          set_length_minutes: number | null
          set_time: string | null
          stage: string | null
          state: string | null
          status: string
          ticket_price: number | null
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          accepted_at?: string | null
          additional_perks?: string | null
          ages?: string | null
          artist_id?: string | null
          artist_name: string
          capacity?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          deposit_notes?: string | null
          deposit_percentage?: number | null
          event_id?: string | null
          expiration_date?: string | null
          guest_list_count?: number | null
          guest_list_notes?: string | null
          id?: string
          indoor_outdoor?: string | null
          merchandise_terms?: string | null
          offer_amount?: number | null
          offer_currency?: string | null
          other_terms?: string | null
          others_on_lineup?: string | null
          past_lineup_url?: string | null
          performance_date?: string | null
          radius_clause?: string | null
          radius_days?: number | null
          radius_miles?: number | null
          raw_offer_text?: string | null
          sent_at?: string | null
          set_length_minutes?: number | null
          set_time?: string | null
          stage?: string | null
          state?: string | null
          status?: string
          ticket_price?: number | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          accepted_at?: string | null
          additional_perks?: string | null
          ages?: string | null
          artist_id?: string | null
          artist_name?: string
          capacity?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          deposit_notes?: string | null
          deposit_percentage?: number | null
          event_id?: string | null
          expiration_date?: string | null
          guest_list_count?: number | null
          guest_list_notes?: string | null
          id?: string
          indoor_outdoor?: string | null
          merchandise_terms?: string | null
          offer_amount?: number | null
          offer_currency?: string | null
          other_terms?: string | null
          others_on_lineup?: string | null
          past_lineup_url?: string | null
          performance_date?: string | null
          radius_clause?: string | null
          radius_days?: number | null
          radius_miles?: number | null
          raw_offer_text?: string | null
          sent_at?: string | null
          set_length_minutes?: number | null
          set_time?: string | null
          stage?: string | null
          state?: string | null
          status?: string
          ticket_price?: number | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_offers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      artist_workflow_completions: {
        Row: {
          artist_id: string
          completed_at: string
          completed_by: string | null
          id: string
          workflow_item_id: string
        }
        Insert: {
          artist_id: string
          completed_at?: string
          completed_by?: string | null
          id?: string
          workflow_item_id: string
        }
        Update: {
          artist_id?: string
          completed_at?: string
          completed_by?: string | null
          id?: string
          workflow_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_workflow_completions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_workflow_completions_workflow_item_id_fkey"
            columns: ["workflow_item_id"]
            isOneToOne: false
            referencedRelation: "artist_workflow_items"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_workflow_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      artists: {
        Row: {
          bio: string | null
          created_at: string
          custom_fields: Json | null
          deal_value: number | null
          event_id: string
          genre: string | null
          id: string
          instagram_url: string | null
          name: string
          notes: string | null
          performance_date: string | null
          pipeline_status: string | null
          set_length_minutes: number | null
          set_time: string | null
          source_artist_id: string | null
          spotify_url: string | null
          stage_name: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          event_id: string
          genre?: string | null
          id?: string
          instagram_url?: string | null
          name: string
          notes?: string | null
          performance_date?: string | null
          pipeline_status?: string | null
          set_length_minutes?: number | null
          set_time?: string | null
          source_artist_id?: string | null
          spotify_url?: string | null
          stage_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          event_id?: string
          genre?: string | null
          id?: string
          instagram_url?: string | null
          name?: string
          notes?: string | null
          performance_date?: string | null
          pipeline_status?: string | null
          set_length_minutes?: number | null
          set_time?: string | null
          source_artist_id?: string | null
          spotify_url?: string | null
          stage_name?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "artists_source_artist_id_fkey"
            columns: ["source_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_feedback: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      box_office_sessions: {
        Row: {
          active: boolean
          addon_type_filter: string[] | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          expires_at: string
          id: string
          label: string
          pin_hash: string
          pin_hint: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          addon_type_filter?: string[] | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          label: string
          pin_hash: string
          pin_hint?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          addon_type_filter?: string[] | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          label?: string
          pin_hash?: string
          pin_hint?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      bulk_email_campaigns: {
        Row: {
          ab_test_enabled: boolean | null
          ab_test_size_percent: number | null
          ab_variant_b_body: string | null
          ab_variant_b_subject: string | null
          ab_winner_metric: string | null
          ab_winner_variant: string | null
          audience: string | null
          body_html: string | null
          created_at: string
          event_id: string | null
          failed_count: number
          id: string
          name: string | null
          recipient_count: number
          scheduled_for: string | null
          sent_at: string
          sent_by: string | null
          sent_count: number
          status: string | null
          subject: string
        }
        Insert: {
          ab_test_enabled?: boolean | null
          ab_test_size_percent?: number | null
          ab_variant_b_body?: string | null
          ab_variant_b_subject?: string | null
          ab_winner_metric?: string | null
          ab_winner_variant?: string | null
          audience?: string | null
          body_html?: string | null
          created_at?: string
          event_id?: string | null
          failed_count?: number
          id?: string
          name?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_count?: number
          status?: string | null
          subject: string
        }
        Update: {
          ab_test_enabled?: boolean | null
          ab_test_size_percent?: number | null
          ab_variant_b_body?: string | null
          ab_variant_b_subject?: string | null
          ab_winner_metric?: string | null
          ab_winner_variant?: string | null
          audience?: string | null
          body_html?: string | null
          created_at?: string
          event_id?: string | null
          failed_count?: number
          id?: string
          name?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          sent_at?: string
          sent_by?: string | null
          sent_count?: number
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_email_campaigns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_email_campaigns_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "bulk_email_campaigns_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canary_run_history: {
        Row: {
          alert_sent: boolean | null
          check_details: Json | null
          duration_ms: number | null
          failed_check_names: string[] | null
          failed_checks: number
          id: string
          passed_checks: number
          run_at: string
          status: string
          total_checks: number
          warning_checks: number
        }
        Insert: {
          alert_sent?: boolean | null
          check_details?: Json | null
          duration_ms?: number | null
          failed_check_names?: string[] | null
          failed_checks: number
          id?: string
          passed_checks: number
          run_at?: string
          status: string
          total_checks: number
          warning_checks: number
        }
        Update: {
          alert_sent?: boolean | null
          check_details?: Json | null
          duration_ms?: number | null
          failed_check_names?: string[] | null
          failed_checks?: number
          id?: string
          passed_checks?: number
          run_at?: string
          status?: string
          total_checks?: number
          warning_checks?: number
        }
        Relationships: []
      }
      cart_intent_signals: {
        Row: {
          converted_at: string | null
          created_at: string
          device_type: string | null
          email: string | null
          fbclid: string | null
          first_seen_at: string
          gclid: string | null
          id: string
          last_seen_at: string
          lead_status: string | null
          name: string | null
          page_url: string | null
          quantity: number | null
          referrer: string | null
          session_id: string
          signal_count: number | null
          signal_type: string
          ticket_type: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          fbclid?: string | null
          first_seen_at?: string
          gclid?: string | null
          id?: string
          last_seen_at?: string
          lead_status?: string | null
          name?: string | null
          page_url?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id: string
          signal_count?: number | null
          signal_type?: string
          ticket_type?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          fbclid?: string | null
          first_seen_at?: string
          gclid?: string | null
          id?: string
          last_seen_at?: string
          lead_status?: string | null
          name?: string | null
          page_url?: string | null
          quantity?: number | null
          referrer?: string | null
          session_id?: string
          signal_count?: number | null
          signal_type?: string
          ticket_type?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      chat_logs: {
        Row: {
          admin_replied_at: string | null
          conversation: Json
          created_at: string
          escalation_email: string | null
          escalation_status: string | null
          id: string
          session_id: string
          summary: string | null
          updated_at: string
          user_email: string | null
          user_name: string | null
        }
        Insert: {
          admin_replied_at?: string | null
          conversation?: Json
          created_at?: string
          escalation_email?: string | null
          escalation_status?: string | null
          id?: string
          session_id: string
          summary?: string | null
          updated_at?: string
          user_email?: string | null
          user_name?: string | null
        }
        Update: {
          admin_replied_at?: string | null
          conversation?: Json
          created_at?: string
          escalation_email?: string | null
          escalation_status?: string | null
          id?: string
          session_id?: string
          summary?: string | null
          updated_at?: string
          user_email?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      chat_replies: {
        Row: {
          admin_user_id: string | null
          body_html: string | null
          body_text: string | null
          created_at: string
          direction: string
          from_email: string
          id: string
          resend_email_id: string | null
          session_id: string
          subject: string | null
          to_email: string
        }
        Insert: {
          admin_user_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction: string
          from_email: string
          id?: string
          resend_email_id?: string | null
          session_id: string
          subject?: string | null
          to_email: string
        }
        Update: {
          admin_user_id?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          id?: string
          resend_email_id?: string | null
          session_id?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_replies_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_alert_throttle: {
        Row: {
          last_sent_at: string
          result_code: string
        }
        Insert: {
          last_sent_at?: string
          result_code: string
        }
        Update: {
          last_sent_at?: string
          result_code?: string
        }
        Relationships: []
      }
      check_in_events: {
        Row: {
          action: string
          client_event_id: string | null
          created_at: string
          day_key: string | null
          holder_name: string | null
          id: string
          occurred_at: string
          registration_id: string | null
          result_code: string | null
          session_id: string | null
          station_label: string | null
          ticket_id: string | null
          ticket_type: string | null
        }
        Insert: {
          action: string
          client_event_id?: string | null
          created_at?: string
          day_key?: string | null
          holder_name?: string | null
          id?: string
          occurred_at?: string
          registration_id?: string | null
          result_code?: string | null
          session_id?: string | null
          station_label?: string | null
          ticket_id?: string | null
          ticket_type?: string | null
        }
        Update: {
          action?: string
          client_event_id?: string | null
          created_at?: string
          day_key?: string | null
          holder_name?: string | null
          id?: string
          occurred_at?: string
          registration_id?: string | null
          result_code?: string | null
          session_id?: string | null
          station_label?: string | null
          ticket_id?: string | null
          ticket_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_in_events_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "box_office_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_abandonment: {
        Row: {
          captured_at: string
          converted_at: string | null
          created_at: string
          email: string
          email_sent_at: string | null
          email_sent_at_2: string | null
          email_sent_at_3: string | null
          id: string
          name: string | null
          phone: string | null
          sms_sent_at: string | null
          ticket_type: string | null
        }
        Insert: {
          captured_at?: string
          converted_at?: string | null
          created_at?: string
          email: string
          email_sent_at?: string | null
          email_sent_at_2?: string | null
          email_sent_at_3?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          sms_sent_at?: string | null
          ticket_type?: string | null
        }
        Update: {
          captured_at?: string
          converted_at?: string | null
          created_at?: string
          email?: string
          email_sent_at?: string | null
          email_sent_at_2?: string | null
          email_sent_at_3?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          sms_sent_at?: string | null
          ticket_type?: string | null
        }
        Relationships: []
      }
      checkout_errors: {
        Row: {
          browser: string | null
          created_at: string
          device_type: string | null
          error_code: string | null
          error_message: string
          error_type: string
          event_id: string | null
          id: string
          ip_address: string | null
          request_payload: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          stack_trace: string | null
          ticket_type: string | null
          user_agent: string | null
          user_email: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          error_code?: string | null
          error_message: string
          error_type: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          request_payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          stack_trace?: string | null
          ticket_type?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_type?: string | null
          error_code?: string | null
          error_message?: string
          error_type?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          request_payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          stack_trace?: string | null
          ticket_type?: string | null
          user_agent?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_errors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_errors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "checkout_errors_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_fees: {
        Row: {
          applies_to: string
          created_at: string
          display_order: number
          fee_key: string
          fee_label: string
          fee_type: string
          fee_value: number
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          applies_to: string
          created_at?: string
          display_order?: number
          fee_key: string
          fee_label: string
          fee_type: string
          fee_value?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          display_order?: number
          fee_key?: string
          fee_label?: string
          fee_type?: string
          fee_value?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          build_version: string | null
          component_stack: string | null
          context: Json | null
          created_at: string
          email: string | null
          id: string
          message: string
          occurred_at: string
          original_stack: string | null
          previous_url: string | null
          referrer: string | null
          resolved: boolean
          route: string | null
          route_params: Json | null
          stack: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          build_version?: string | null
          component_stack?: string | null
          context?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          occurred_at?: string
          original_stack?: string | null
          previous_url?: string | null
          referrer?: string | null
          resolved?: boolean
          route?: string | null
          route_params?: Json | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          build_version?: string | null
          component_stack?: string | null
          context?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          occurred_at?: string
          original_stack?: string | null
          previous_url?: string | null
          referrer?: string | null
          resolved?: boolean
          route?: string | null
          route_params?: Json | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      community_requests: {
        Row: {
          created_at: string
          description: string
          email: string
          group_size: number
          id: string
          organization_name: string
          organizer_name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          email: string
          group_size: number
          id?: string
          organization_name: string
          organizer_name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          email?: string
          group_size?: number
          id?: string
          organization_name?: string
          organizer_name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      contract_signatures: {
        Row: {
          agreement_text: string
          contract_id: string
          id: string
          ip_address: string | null
          signed_at: string
          signer_email: string
          signer_name: string
          signer_title: string | null
          signer_type: string
          user_agent: string | null
        }
        Insert: {
          agreement_text?: string
          contract_id: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signer_email: string
          signer_name: string
          signer_title?: string | null
          signer_type: string
          user_agent?: string | null
        }
        Update: {
          agreement_text?: string
          contract_id?: string
          id?: string
          ip_address?: string | null
          signed_at?: string
          signer_email?: string
          signer_name?: string
          signer_title?: string | null
          signer_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          content_html: string
          created_at: string
          created_by: string | null
          description: string | null
          entity_type: string
          event_id: string | null
          id: string
          is_active: boolean | null
          merge_fields: Json | null
          name: string
          requires_countersign: boolean | null
          updated_at: string
        }
        Insert: {
          content_html: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          merge_fields?: Json | null
          name: string
          requires_countersign?: boolean | null
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_type?: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          merge_fields?: Json | null
          name?: string
          requires_countersign?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      contracts: {
        Row: {
          access_token: string | null
          content_html: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          event_id: string
          expires_at: string | null
          id: string
          merge_data: Json | null
          notes: string | null
          pdf_path: string | null
          requires_countersign: boolean | null
          sent_at: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          access_token?: string | null
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          event_id: string
          expires_at?: string | null
          id?: string
          merge_data?: Json | null
          notes?: string | null
          pdf_path?: string | null
          requires_countersign?: boolean | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          access_token?: string | null
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          merge_data?: Json | null
          notes?: string | null
          pdf_path?: string | null
          requires_countersign?: boolean | null
          sent_at?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_bids: {
        Row: {
          accepted_price: number | null
          bid_price: number
          captain_name: string
          checkout_expires_at: string | null
          checkout_token: string | null
          client_ip: string | null
          client_user_agent: string | null
          created_at: string
          crew_size: number
          email: string
          fbc: string | null
          fbp: string | null
          id: string
          meta_event_id: string | null
          payment_status: string | null
          phone: string | null
          pitch: string | null
          sms_reminder_sent_at: string | null
          status: string
          stripe_session_id: string | null
          ticket_type: string
          updated_at: string
        }
        Insert: {
          accepted_price?: number | null
          bid_price: number
          captain_name: string
          checkout_expires_at?: string | null
          checkout_token?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          crew_size: number
          email: string
          fbc?: string | null
          fbp?: string | null
          id?: string
          meta_event_id?: string | null
          payment_status?: string | null
          phone?: string | null
          pitch?: string | null
          sms_reminder_sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          ticket_type: string
          updated_at?: string
        }
        Update: {
          accepted_price?: number | null
          bid_price?: number
          captain_name?: string
          checkout_expires_at?: string | null
          checkout_token?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          created_at?: string
          crew_size?: number
          email?: string
          fbc?: string | null
          fbp?: string | null
          id?: string
          meta_event_id?: string | null
          payment_status?: string | null
          phone?: string | null
          pitch?: string | null
          sms_reminder_sent_at?: string | null
          status?: string
          stripe_session_id?: string | null
          ticket_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      crew_campaign_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_offer_items: {
        Row: {
          accommodation_unit_id: string | null
          addon_inventory_id: string | null
          created_at: string
          id: string
          item_type: string
          lodging_inventory_id: string | null
          offer_id: string
          quantity: number
          ticket_type: string | null
          unit_price: number
          zone_key: string | null
        }
        Insert: {
          accommodation_unit_id?: string | null
          addon_inventory_id?: string | null
          created_at?: string
          id?: string
          item_type: string
          lodging_inventory_id?: string | null
          offer_id: string
          quantity?: number
          ticket_type?: string | null
          unit_price: number
          zone_key?: string | null
        }
        Update: {
          accommodation_unit_id?: string | null
          addon_inventory_id?: string | null
          created_at?: string
          id?: string
          item_type?: string
          lodging_inventory_id?: string | null
          offer_id?: string
          quantity?: number
          ticket_type?: string | null
          unit_price?: number
          zone_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_offer_items_accommodation_unit_id_fkey"
            columns: ["accommodation_unit_id"]
            isOneToOne: false
            referencedRelation: "accommodation_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offer_items_accommodation_unit_id_fkey"
            columns: ["accommodation_unit_id"]
            isOneToOne: false
            referencedRelation: "accommodation_units_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offer_items_addon_inventory_id_fkey"
            columns: ["addon_inventory_id"]
            isOneToOne: false
            referencedRelation: "addon_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offer_items_lodging_inventory_id_fkey"
            columns: ["lodging_inventory_id"]
            isOneToOne: false
            referencedRelation: "lodging_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "custom_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offer_items_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "accommodation_zones"
            referencedColumns: ["zone_key"]
          },
        ]
      }
      custom_offers: {
        Row: {
          accepted_at: string | null
          allowed_ticket_types: string[] | null
          created_at: string
          created_by: string | null
          custom_message: string | null
          discount_amount: number
          discount_type: string | null
          discount_value: number | null
          event_id: string
          expires_at: string
          id: string
          max_redemptions: number | null
          notes: string | null
          offer_token: string
          offer_type: string
          recipient_email: string
          recipient_name: string | null
          redemptions_used: number | null
          registration_id: string | null
          requires_existing_ticket: boolean | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          allowed_ticket_types?: string[] | null
          created_at?: string
          created_by?: string | null
          custom_message?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          event_id: string
          expires_at: string
          id?: string
          max_redemptions?: number | null
          notes?: string | null
          offer_token: string
          offer_type?: string
          recipient_email: string
          recipient_name?: string | null
          redemptions_used?: number | null
          registration_id?: string | null
          requires_existing_ticket?: boolean | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          allowed_ticket_types?: string[] | null
          created_at?: string
          created_by?: string | null
          custom_message?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          event_id?: string
          expires_at?: string
          id?: string
          max_redemptions?: number | null
          notes?: string | null
          offer_token?: string
          offer_type?: string
          recipient_email?: string
          recipient_name?: string | null
          redemptions_used?: number | null
          registration_id?: string | null
          requires_existing_ticket?: boolean | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "custom_offers_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_queue: {
        Row: {
          created_at: string
          error_message: string | null
          failed_at: string
          id: string
          operation_type: string
          original_id: string
          original_table: string
          payload: Json
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_at?: string
          id?: string
          operation_type: string
          original_id: string
          original_table: string
          payload: Json
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_at?: string
          id?: string
          operation_type?: string
          original_id?: string
          original_table?: string
          payload?: Json
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          auto_remediation_attempts: number
          auto_remediation_last_at: string | null
          auto_remediation_rule: string | null
          auto_remediation_status: string
          created_at: string
          first_seen_at: string
          function_name: string
          id: string
          last_seen_at: string
          last_sms_at: string | null
          message: string
          notes: string | null
          occurrence_count: number
          remediation_attempted: string | null
          resolved_at: string | null
          sample_context: Json | null
          sample_stack: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          signature: string
          source: string
          status: Database["public"]["Enums"]["incident_status"]
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          auto_remediation_attempts?: number
          auto_remediation_last_at?: string | null
          auto_remediation_rule?: string | null
          auto_remediation_status?: string
          created_at?: string
          first_seen_at?: string
          function_name: string
          id?: string
          last_seen_at?: string
          last_sms_at?: string | null
          message: string
          notes?: string | null
          occurrence_count?: number
          remediation_attempted?: string | null
          resolved_at?: string | null
          sample_context?: Json | null
          sample_stack?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          signature: string
          source?: string
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          auto_remediation_attempts?: number
          auto_remediation_last_at?: string | null
          auto_remediation_rule?: string | null
          auto_remediation_status?: string
          created_at?: string
          first_seen_at?: string
          function_name?: string
          id?: string
          last_seen_at?: string
          last_sms_at?: string | null
          message?: string
          notes?: string | null
          occurrence_count?: number
          remediation_attempted?: string | null
          resolved_at?: string | null
          sample_context?: Json | null
          sample_stack?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          signature?: string
          source?: string
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string
        }
        Relationships: []
      }
      email_bounces: {
        Row: {
          bounce_type: string
          created_at: string
          email: string
          event_payload: Json | null
          id: string
          reason: string | null
          source: string | null
        }
        Insert: {
          bounce_type: string
          created_at?: string
          email: string
          event_payload?: Json | null
          id?: string
          reason?: string | null
          source?: string | null
        }
        Update: {
          bounce_type?: string
          created_at?: string
          email?: string
          event_payload?: Json | null
          id?: string
          reason?: string | null
          source?: string | null
        }
        Relationships: []
      }
      email_click_events: {
        Row: {
          clicked_at: string | null
          id: string
          ip_address: string | null
          link_url: string
          log_id: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_at?: string | null
          id?: string
          ip_address?: string | null
          link_url: string
          log_id?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_at?: string | null
          id?: string
          ip_address?: string | null
          link_url?: string
          log_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_click_events_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "email_sequence_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          campaign_id: string | null
          created_at: string
          email_content: string | null
          email_type: string
          error_message: string | null
          id: string
          registration_id: string
          sent_at: string
          sent_by: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email_content?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          registration_id: string
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email_content?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          registration_id?: string
          sent_at?: string
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_rate_limits: {
        Row: {
          cooldown_minutes: number
          created_at: string | null
          email_type: string
          id: string
          last_sent_at: string
          registration_id: string
          updated_at: string | null
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string | null
          email_type: string
          id?: string
          last_sent_at?: string
          registration_id: string
          updated_at?: string | null
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string | null
          email_type?: string
          id?: string
          last_sent_at?: string
          registration_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_rate_limits_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_logs: {
        Row: {
          click_count: number | null
          clicked_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          registration_id: string
          scheduled_for: string | null
          sent_at: string | null
          sequence_id: string
          status: string
          step_id: string
          tracking_id: string | null
        }
        Insert: {
          click_count?: number | null
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          registration_id: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_id: string
          status?: string
          step_id: string
          tracking_id?: string | null
        }
        Update: {
          click_count?: number | null
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          registration_id?: string
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_id?: string
          status?: string
          step_id?: string
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_logs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_logs_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "email_sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          body_html: string
          created_at: string | null
          email_format: string | null
          footer_text: string | null
          heading: string | null
          id: string
          intro_text: string | null
          is_active: boolean | null
          name: string
          sequence_id: string
          step_order: number
          subject: string
          timing_days: number
          timing_hour: number | null
          timing_type: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          created_at?: string | null
          email_format?: string | null
          footer_text?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean | null
          name: string
          sequence_id: string
          step_order: number
          subject: string
          timing_days?: number
          timing_hour?: number | null
          timing_type?: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string | null
          email_format?: string | null
          footer_text?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean | null
          name?: string
          sequence_id?: string
          step_order?: number
          subject?: string
          timing_days?: number
          timing_hour?: number | null
          timing_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string | null
          description: string | null
          event_id: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      email_settings: {
        Row: {
          artisan_cc_emails: string[] | null
          artisan_default_sender_id: string | null
          artist_cc_emails: string[] | null
          artist_default_sender_id: string | null
          artist_from_email: string | null
          artist_from_name: string | null
          auto_send_event_info: boolean | null
          contract_from_email: string | null
          contract_from_name: string | null
          created_at: string | null
          daily_sales_report_enabled: boolean | null
          daily_sales_report_time: string | null
          default_cc_emails: string[] | null
          guest_from_email: string | null
          guest_from_name: string | null
          id: string
          notify_admins_new_registrations: boolean | null
          notify_volunteer_submissions: boolean | null
          partner_cc_emails: string[] | null
          partner_default_sender_id: string | null
          production_from_email: string | null
          production_from_name: string | null
          send_reminder_emails: boolean | null
          signature_line: string
          signature_name: string
          system_from_email: string | null
          system_from_name: string | null
          talent_from_email: string | null
          talent_from_name: string | null
          updated_at: string | null
          vendor_cc_emails: string[] | null
          vendor_default_sender_id: string | null
          volunteer_cc_emails: string[] | null
          volunteer_coordinator_email: string | null
          volunteer_default_sender_id: string | null
          winery_cc_emails: string[] | null
          winery_default_sender_id: string | null
          winery_from_email: string | null
          winery_from_name: string | null
        }
        Insert: {
          artisan_cc_emails?: string[] | null
          artisan_default_sender_id?: string | null
          artist_cc_emails?: string[] | null
          artist_default_sender_id?: string | null
          artist_from_email?: string | null
          artist_from_name?: string | null
          auto_send_event_info?: boolean | null
          contract_from_email?: string | null
          contract_from_name?: string | null
          created_at?: string | null
          daily_sales_report_enabled?: boolean | null
          daily_sales_report_time?: string | null
          default_cc_emails?: string[] | null
          guest_from_email?: string | null
          guest_from_name?: string | null
          id?: string
          notify_admins_new_registrations?: boolean | null
          notify_volunteer_submissions?: boolean | null
          partner_cc_emails?: string[] | null
          partner_default_sender_id?: string | null
          production_from_email?: string | null
          production_from_name?: string | null
          send_reminder_emails?: boolean | null
          signature_line?: string
          signature_name?: string
          system_from_email?: string | null
          system_from_name?: string | null
          talent_from_email?: string | null
          talent_from_name?: string | null
          updated_at?: string | null
          vendor_cc_emails?: string[] | null
          vendor_default_sender_id?: string | null
          volunteer_cc_emails?: string[] | null
          volunteer_coordinator_email?: string | null
          volunteer_default_sender_id?: string | null
          winery_cc_emails?: string[] | null
          winery_default_sender_id?: string | null
          winery_from_email?: string | null
          winery_from_name?: string | null
        }
        Update: {
          artisan_cc_emails?: string[] | null
          artisan_default_sender_id?: string | null
          artist_cc_emails?: string[] | null
          artist_default_sender_id?: string | null
          artist_from_email?: string | null
          artist_from_name?: string | null
          auto_send_event_info?: boolean | null
          contract_from_email?: string | null
          contract_from_name?: string | null
          created_at?: string | null
          daily_sales_report_enabled?: boolean | null
          daily_sales_report_time?: string | null
          default_cc_emails?: string[] | null
          guest_from_email?: string | null
          guest_from_name?: string | null
          id?: string
          notify_admins_new_registrations?: boolean | null
          notify_volunteer_submissions?: boolean | null
          partner_cc_emails?: string[] | null
          partner_default_sender_id?: string | null
          production_from_email?: string | null
          production_from_name?: string | null
          send_reminder_emails?: boolean | null
          signature_line?: string
          signature_name?: string
          system_from_email?: string | null
          system_from_name?: string | null
          talent_from_email?: string | null
          talent_from_name?: string | null
          updated_at?: string | null
          vendor_cc_emails?: string[] | null
          vendor_default_sender_id?: string | null
          volunteer_cc_emails?: string[] | null
          volunteer_coordinator_email?: string | null
          volunteer_default_sender_id?: string | null
          winery_cc_emails?: string[] | null
          winery_default_sender_id?: string | null
          winery_from_email?: string | null
          winery_from_name?: string | null
        }
        Relationships: []
      }
      email_template_config: {
        Row: {
          accent_color: string | null
          accent_gold_color: string | null
          background_color: string | null
          border_color: string | null
          brand_name: string | null
          created_at: string
          dark_bg_color: string | null
          dark_muted_color: string | null
          dark_surface_color: string | null
          dark_text_color: string | null
          error_color: string | null
          font_family: string | null
          footer_text: string | null
          heading_font_family: string | null
          id: string
          info_color: string | null
          logo_url: string | null
          primary_color: string | null
          primary_gold_color: string | null
          success_color: string | null
          surface_alt_color: string | null
          surface_color: string | null
          text_color: string | null
          text_muted_color: string | null
          unsubscribe_text: string | null
          updated_at: string
          warning_color: string | null
        }
        Insert: {
          accent_color?: string | null
          accent_gold_color?: string | null
          background_color?: string | null
          border_color?: string | null
          brand_name?: string | null
          created_at?: string
          dark_bg_color?: string | null
          dark_muted_color?: string | null
          dark_surface_color?: string | null
          dark_text_color?: string | null
          error_color?: string | null
          font_family?: string | null
          footer_text?: string | null
          heading_font_family?: string | null
          id?: string
          info_color?: string | null
          logo_url?: string | null
          primary_color?: string | null
          primary_gold_color?: string | null
          success_color?: string | null
          surface_alt_color?: string | null
          surface_color?: string | null
          text_color?: string | null
          text_muted_color?: string | null
          unsubscribe_text?: string | null
          updated_at?: string
          warning_color?: string | null
        }
        Update: {
          accent_color?: string | null
          accent_gold_color?: string | null
          background_color?: string | null
          border_color?: string | null
          brand_name?: string | null
          created_at?: string
          dark_bg_color?: string | null
          dark_muted_color?: string | null
          dark_surface_color?: string | null
          dark_text_color?: string | null
          error_color?: string | null
          font_family?: string | null
          footer_text?: string | null
          heading_font_family?: string | null
          id?: string
          info_color?: string | null
          logo_url?: string | null
          primary_color?: string | null
          primary_gold_color?: string | null
          success_color?: string | null
          surface_alt_color?: string | null
          surface_color?: string | null
          text_color?: string | null
          text_muted_color?: string | null
          unsubscribe_text?: string | null
          updated_at?: string
          warning_color?: string | null
        }
        Relationships: []
      }
      email_template_versions: {
        Row: {
          body_html: string
          change_summary: string | null
          changed_by: string | null
          created_at: string
          id: string
          subject: string
          template_id: string
          template_source: string
          version_number: number
        }
        Insert: {
          body_html: string
          change_summary?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          subject: string
          template_id: string
          template_source: string
          version_number?: number
        }
        Update: {
          body_html?: string
          change_summary?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          subject?: string
          template_id?: string
          template_source?: string
          version_number?: number
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          button_text: string | null
          created_at: string
          custom_styles: Json | null
          footer_text: string | null
          heading: string | null
          id: string
          intro_text: string | null
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          button_text?: string | null
          created_at?: string
          custom_styles?: Json | null
          footer_text?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          subject: string
          template_type: string
          updated_at?: string
        }
        Update: {
          button_text?: string | null
          created_at?: string
          custom_styles?: Json | null
          footer_text?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribes: {
        Row: {
          email: string
          id: string
          reason: string | null
          source: string | null
          unsubscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          reason?: string | null
          source?: string | null
          unsubscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          reason?: string | null
          source?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      entity_email_registry: {
        Row: {
          created_at: string
          email: string
          entity_id: string
          entity_name: string
          entity_type: string
          event_id: string | null
          id: string
          is_active: boolean | null
          last_matched_at: string | null
          learned_at: string
          learned_by: string | null
          learned_from_import_id: string | null
          match_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          entity_id: string
          entity_name: string
          entity_type: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_matched_at?: string | null
          learned_at?: string
          learned_by?: string | null
          learned_from_import_id?: string | null
          match_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          entity_id?: string
          entity_name?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          last_matched_at?: string | null
          learned_at?: string
          learned_by?: string | null
          learned_from_import_id?: string | null
          match_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_email_registry_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_email_registry_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "entity_email_registry_learned_from_import_id_fkey"
            columns: ["learned_from_import_id"]
            isOneToOne: false
            referencedRelation: "pending_email_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_ownership: {
        Row: {
          collaborator_ids: string[] | null
          created_at: string | null
          entity_id: string
          entity_type: string
          event_id: string | null
          id: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          collaborator_ids?: string[] | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          event_id?: string | null
          id?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          collaborator_ids?: string[] | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_ownership_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_ownership_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      entity_ownership_defaults: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      event_details: {
        Row: {
          accommodations_enabled: boolean | null
          additional_info: string | null
          check_in_instructions: string | null
          created_at: string | null
          description: string | null
          event_date: string
          event_time: string
          id: string
          is_active: boolean
          parking_info: string | null
          status: string
          title: string
          updated_at: string | null
          venue_address: string
          venue_name: string
        }
        Insert: {
          accommodations_enabled?: boolean | null
          additional_info?: string | null
          check_in_instructions?: string | null
          created_at?: string | null
          description?: string | null
          event_date: string
          event_time: string
          id?: string
          is_active?: boolean
          parking_info?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          venue_address: string
          venue_name: string
        }
        Update: {
          accommodations_enabled?: boolean | null
          additional_info?: string | null
          check_in_instructions?: string | null
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_time?: string
          id?: string
          is_active?: boolean
          parking_info?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          venue_address?: string
          venue_name?: string
        }
        Relationships: []
      }
      event_photo_links: {
        Row: {
          cover_images: Json
          created_at: string
          description: string | null
          event_id: string
          id: string
          instagram_handle: string | null
          is_published: boolean
          photographer_name: string
          posting_credit_note: string | null
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          cover_images?: Json
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          instagram_handle?: string | null
          is_published?: boolean
          photographer_name: string
          posting_credit_note?: string | null
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          cover_images?: Json
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          instagram_handle?: string | null
          is_published?: boolean
          photographer_name?: string
          posting_credit_note?: string | null
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      event_reflections: {
        Row: {
          email: string
          event_id: string
          id: string
          is_favorite: boolean
          reflection_text: string
          submitted_at: string
          ticket_holder_name: string | null
          updated_at: string
        }
        Insert: {
          email: string
          event_id: string
          id?: string
          is_favorite?: boolean
          reflection_text: string
          submitted_at?: string
          ticket_holder_name?: string | null
          updated_at?: string
        }
        Update: {
          email?: string
          event_id?: string
          id?: string
          is_favorite?: boolean
          reflection_text?: string
          submitted_at?: string
          ticket_holder_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_reminder_logs: {
        Row: {
          error_message: string | null
          id: string
          registration_id: string | null
          reminder_type: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          registration_id?: string | null
          reminder_type: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          error_message?: string | null
          id?: string
          registration_id?: string | null
          reminder_type?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_logs_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          body_text: string
          button_text: string | null
          created_at: string | null
          enabled: boolean | null
          footer_text: string | null
          heading: string
          id: string
          intro_text: string
          reminder_type: string
          send_days_offset: number
          send_time: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          body_text: string
          button_text?: string | null
          created_at?: string | null
          enabled?: boolean | null
          footer_text?: string | null
          heading: string
          id?: string
          intro_text: string
          reminder_type: string
          send_days_offset: number
          send_time?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          body_text?: string
          button_text?: string | null
          created_at?: string | null
          enabled?: boolean | null
          footer_text?: string | null
          heading?: string
          id?: string
          intro_text?: string
          reminder_type?: string
          send_days_offset?: number
          send_time?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      flodesk_sync_queue: {
        Row: {
          attempts: number
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_error: string | null
          last_name: string | null
          processed_at: string | null
          segment_tag: string | null
          source_id: string | null
          source_table: string
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_error?: string | null
          last_name?: string | null
          processed_at?: string | null
          segment_tag?: string | null
          source_id?: string | null
          source_table: string
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_error?: string | null
          last_name?: string | null
          processed_at?: string | null
          segment_tag?: string | null
          source_id?: string | null
          source_table?: string
          status?: string
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          landing_page: string | null
          metadata: Json | null
          referrer: string | null
          session_id: string
          source_path: string | null
          step: string
          step_index: number
          time_from_previous_ms: number | null
          time_from_start_ms: number | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          landing_page?: string | null
          metadata?: Json | null
          referrer?: string | null
          session_id: string
          source_path?: string | null
          step: string
          step_index: number
          time_from_previous_ms?: number | null
          time_from_start_ms?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          landing_page?: string | null
          metadata?: Json | null
          referrer?: string | null
          session_id?: string
          source_path?: string | null
          step?: string
          step_index?: number
          time_from_previous_ms?: number | null
          time_from_start_ms?: number | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      funnel_step_alerts: {
        Row: {
          alert_active: boolean
          breach_started_at: string | null
          created_at: string
          current_completion_rate: number | null
          current_sessions: number
          id: string
          is_active: boolean
          last_alerted_at: string | null
          last_checked_at: string | null
          last_status_message: string | null
          metadata: Json
          min_completion_rate: number
          min_sessions: number
          preceding_step_name: string
          resolved_at: string | null
          step_name: string
          sustain_hours: number
          updated_at: string
        }
        Insert: {
          alert_active?: boolean
          breach_started_at?: string | null
          created_at?: string
          current_completion_rate?: number | null
          current_sessions?: number
          id?: string
          is_active?: boolean
          last_alerted_at?: string | null
          last_checked_at?: string | null
          last_status_message?: string | null
          metadata?: Json
          min_completion_rate?: number
          min_sessions?: number
          preceding_step_name: string
          resolved_at?: string | null
          step_name: string
          sustain_hours?: number
          updated_at?: string
        }
        Update: {
          alert_active?: boolean
          breach_started_at?: string | null
          created_at?: string
          current_completion_rate?: number | null
          current_sessions?: number
          id?: string
          is_active?: boolean
          last_alerted_at?: string | null
          last_checked_at?: string | null
          last_status_message?: string | null
          metadata?: Json
          min_completion_rate?: number
          min_sessions?: number
          preceding_step_name?: string
          resolved_at?: string | null
          step_name?: string
          sustain_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      incident_alert_config: {
        Row: {
          admin_phone: string
          id: number
          min_sms_severity: Database["public"]["Enums"]["incident_severity"]
          per_incident_cooldown_minutes: number
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          admin_phone?: string
          id?: number
          min_sms_severity?: Database["public"]["Enums"]["incident_severity"]
          per_incident_cooldown_minutes?: number
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          admin_phone?: string
          id?: number
          min_sms_severity?: Database["public"]["Enums"]["incident_severity"]
          per_incident_cooldown_minutes?: number
          sms_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      incident_digest_log: {
        Row: {
          auto_resolved: number
          channels_sent: string[]
          id: string
          needs_attention: number
          payload: Json | null
          sent_at: string
          total_incidents: number
          window_end: string
          window_start: string
        }
        Insert: {
          auto_resolved?: number
          channels_sent?: string[]
          id?: string
          needs_attention?: number
          payload?: Json | null
          sent_at?: string
          total_incidents?: number
          window_end: string
          window_start: string
        }
        Update: {
          auto_resolved?: number
          channels_sent?: string[]
          id?: string
          needs_attention?: number
          payload?: Json | null
          sent_at?: string
          total_incidents?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      individual_emails: {
        Row: {
          body_html: string
          created_at: string | null
          id: string
          registration_id: string
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          body_html: string
          created_at?: string | null
          id?: string
          registration_id: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string | null
          id?: string
          registration_id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_emails_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_emails_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "saved_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          note: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          note: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_tracking"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tracking: {
        Row: {
          assigned_to: string | null
          created_at: string
          email: string
          id: string
          last_contacted_at: string | null
          name: string | null
          source: string
          status: string
          ticket_type_interest: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          email: string
          id?: string
          last_contacted_at?: string | null
          name?: string | null
          source?: string
          status?: string
          ticket_type_interest?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          email?: string
          id?: string
          last_contacted_at?: string | null
          name?: string | null
          source?: string
          status?: string
          ticket_type_interest?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tracking_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_bookings: {
        Row: {
          assigned_at: string | null
          assigned_unit_id: string | null
          assignee_company: string | null
          assignee_name: string | null
          assignee_type: string
          assignment_status: string | null
          created_at: string
          email: string
          event_id: string
          guest_notified: boolean
          id: string
          notes: string | null
          notified_at: string | null
          payment_status: string
          preferences: Json | null
          quantity: number
          recovery_email_sent_at: string | null
          registration_id: string | null
          stripe_session_id: string | null
          total_amount: number
          updated_at: string
          zone_key: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_unit_id?: string | null
          assignee_company?: string | null
          assignee_name?: string | null
          assignee_type?: string
          assignment_status?: string | null
          created_at?: string
          email: string
          event_id: string
          guest_notified?: boolean
          id?: string
          notes?: string | null
          notified_at?: string | null
          payment_status?: string
          preferences?: Json | null
          quantity?: number
          recovery_email_sent_at?: string | null
          registration_id?: string | null
          stripe_session_id?: string | null
          total_amount: number
          updated_at?: string
          zone_key: string
        }
        Update: {
          assigned_at?: string | null
          assigned_unit_id?: string | null
          assignee_company?: string | null
          assignee_name?: string | null
          assignee_type?: string
          assignment_status?: string | null
          created_at?: string
          email?: string
          event_id?: string
          guest_notified?: boolean
          id?: string
          notes?: string | null
          notified_at?: string | null
          payment_status?: string
          preferences?: Json | null
          quantity?: number
          recovery_email_sent_at?: string | null
          registration_id?: string | null
          stripe_session_id?: string | null
          total_amount?: number
          updated_at?: string
          zone_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodging_bookings_assigned_unit_id_fkey"
            columns: ["assigned_unit_id"]
            isOneToOne: false
            referencedRelation: "accommodation_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_bookings_assigned_unit_id_fkey"
            columns: ["assigned_unit_id"]
            isOneToOne: false
            referencedRelation: "accommodation_units_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "lodging_bookings_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_bookings_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "accommodation_zones"
            referencedColumns: ["zone_key"]
          },
        ]
      }
      lodging_inventory: {
        Row: {
          amenities: string[] | null
          bed_config: string | null
          capacity: number | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string | null
          description: string | null
          display_name: string
          event_id: string | null
          id: string
          images: string[] | null
          is_active: boolean
          is_publicly_available: boolean
          location_notes: string | null
          lodging_type: string
          policies: string | null
          price: number
          required_ticket_types: string[] | null
          sold_quantity: number
          total_quantity: number
          updated_at: string | null
        }
        Insert: {
          amenities?: string[] | null
          bed_config?: string | null
          capacity?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          description?: string | null
          display_name: string
          event_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_publicly_available?: boolean
          location_notes?: string | null
          lodging_type: string
          policies?: string | null
          price?: number
          required_ticket_types?: string[] | null
          sold_quantity?: number
          total_quantity: number
          updated_at?: string | null
        }
        Update: {
          amenities?: string[] | null
          bed_config?: string | null
          capacity?: number | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          event_id?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_publicly_available?: boolean
          location_notes?: string | null
          lodging_type?: string
          policies?: string | null
          price?: number
          required_ticket_types?: string[] | null
          sold_quantity?: number
          total_quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodging_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lodging_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      lodging_invite_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          registration_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          registration_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          registration_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lodging_invite_tokens_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      lodging_settings: {
        Row: {
          created_at: string
          id: string
          invite_email_body: string | null
          invite_email_subject: string | null
          lodging_enabled: boolean
          lodging_invite_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_email_body?: string | null
          invite_email_subject?: string | null
          lodging_enabled?: boolean
          lodging_invite_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_email_body?: string | null
          invite_email_subject?: string | null
          lodging_enabled?: boolean
          lodging_invite_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      lodging_visual_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          image_type: string
          image_url: string
          is_active: boolean
          product_type: string
          source_note: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_type: string
          image_url: string
          is_active?: boolean
          product_type: string
          source_note?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_type?: string
          image_url?: string
          is_active?: boolean
          product_type?: string
          source_note?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      my_tickets_sessions: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          last_used_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token?: string
        }
        Relationships: []
      }
      newsletter_leads: {
        Row: {
          click_count: number | null
          created_at: string
          email: string
          engagement_status: string | null
          first_name: string | null
          flodesk_subscriber_id: string | null
          has_purchased: boolean
          id: string
          last_clicked_at: string | null
          last_name: string | null
          last_opened_at: string | null
          lead_status: string
          open_count: number | null
          segments: string[] | null
          source: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string
          email: string
          engagement_status?: string | null
          first_name?: string | null
          flodesk_subscriber_id?: string | null
          has_purchased?: boolean
          id?: string
          last_clicked_at?: string | null
          last_name?: string | null
          last_opened_at?: string | null
          lead_status?: string
          open_count?: number | null
          segments?: string[] | null
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          click_count?: number | null
          created_at?: string
          email?: string
          engagement_status?: string | null
          first_name?: string | null
          flodesk_subscriber_id?: string | null
          has_purchased?: boolean
          id?: string
          last_clicked_at?: string | null
          last_name?: string | null
          last_opened_at?: string | null
          lead_status?: string
          open_count?: number | null
          segments?: string[] | null
          source?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_contacts: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          name: string
          partner_id: string
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name: string
          partner_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name?: string
          partner_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_contracts: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          notes: string | null
          partner_id: string
          sent_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["vendor_contract_status"] | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          partner_id: string
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["vendor_contract_status"] | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          partner_id?: string
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["vendor_contract_status"] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "partner_contracts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_deliverables: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          event_id: string | null
          id: string
          is_completed: boolean | null
          notes: string | null
          partner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          partner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          partner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "partner_deliverables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_documents: {
        Row: {
          contract_id: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          partner_id: string
          uploaded_by: string | null
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          document_type: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          partner_id: string
          uploaded_by?: string | null
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          partner_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "partner_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          cash_value: number | null
          company_name: string | null
          created_at: string
          custom_fields: Json | null
          deal_value: number | null
          deliverables: string | null
          email: string | null
          event_id: string | null
          id: string
          in_kind_value: number | null
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status"] | null
          tier: Database["public"]["Enums"]["partner_tier"] | null
          total_value: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          cash_value?: number | null
          company_name?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          deliverables?: string | null
          email?: string | null
          event_id?: string | null
          id?: string
          in_kind_value?: number | null
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          tier?: Database["public"]["Enums"]["partner_tier"] | null
          total_value?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          cash_value?: number | null
          company_name?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          deliverables?: string | null
          email?: string | null
          event_id?: string | null
          id?: string
          in_kind_value?: number | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          tier?: Database["public"]["Enums"]["partner_tier"] | null
          total_value?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      payment_idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          registration_id: string | null
          request_hash: string | null
          status: string
          stripe_session_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          registration_id?: string | null
          request_hash?: string | null
          status?: string
          stripe_session_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          registration_id?: string | null
          request_hash?: string | null
          status?: string
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_idempotency_keys_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_config: {
        Row: {
          created_at: string
          cutoff_date: string
          id: string
          is_enabled: boolean
          max_retry_attempts: number
          min_cart_amount: number
          post_cutoff_dates: Json
          post_cutoff_payment_count: number
          post_cutoff_splits: Json
          pre_cutoff_dates: Json
          pre_cutoff_payment_count: number
          pre_cutoff_splits: Json
          retry_window_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_date?: string
          id?: string
          is_enabled?: boolean
          max_retry_attempts?: number
          min_cart_amount?: number
          post_cutoff_dates?: Json
          post_cutoff_payment_count?: number
          post_cutoff_splits?: Json
          pre_cutoff_dates?: Json
          pre_cutoff_payment_count?: number
          pre_cutoff_splits?: Json
          retry_window_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_date?: string
          id?: string
          is_enabled?: boolean
          max_retry_attempts?: number
          min_cart_amount?: number
          post_cutoff_dates?: Json
          post_cutoff_payment_count?: number
          post_cutoff_splits?: Json
          pre_cutoff_dates?: Json
          pre_cutoff_payment_count?: number
          pre_cutoff_splits?: Json
          retry_window_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_plan_enrollments: {
        Row: {
          buyer_email: string
          buyer_name: string
          created_at: string
          id: string
          locked_price: boolean
          payment_count: number
          payment_splits: Json
          registration_id: string | null
          status: string
          stripe_customer_id: string
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_email: string
          buyer_name: string
          created_at?: string
          id?: string
          locked_price?: boolean
          payment_count: number
          payment_splits: Json
          registration_id?: string | null
          status?: string
          stripe_customer_id: string
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_email?: string
          buyer_name?: string
          created_at?: string
          id?: string
          locked_price?: boolean
          payment_count?: number
          payment_splits?: Json
          registration_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_enrollments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_artist_imports: {
        Row: {
          confidence_score: number | null
          created_at: string
          event_id: string | null
          id: string
          notes: string | null
          parsed_data: Json
          raw_content: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_email: string
          source_subject: string | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          notes?: string | null
          parsed_data: Json
          raw_content: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_email: string
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          event_id?: string | null
          id?: string
          notes?: string | null
          parsed_data?: Json
          raw_content?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_email?: string
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_artist_imports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_artist_imports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "pending_artist_imports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_email_imports: {
        Row: {
          attachments: Json | null
          category_confidence: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_category: string | null
          created_at: string
          created_entity_id: string | null
          created_entity_type: string | null
          event_id: string | null
          id: string
          merged_with_entity_id: string | null
          notes: string | null
          parsed_company: Json | null
          parsed_contacts: Json | null
          parsed_summary: Json | null
          potential_duplicates: Json | null
          raw_email_html: string | null
          raw_email_text: string | null
          received_at: string
          recommended_category: string | null
          source_email: string
          source_name: string | null
          source_subject: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          category_confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_category?: string | null
          created_at?: string
          created_entity_id?: string | null
          created_entity_type?: string | null
          event_id?: string | null
          id?: string
          merged_with_entity_id?: string | null
          notes?: string | null
          parsed_company?: Json | null
          parsed_contacts?: Json | null
          parsed_summary?: Json | null
          potential_duplicates?: Json | null
          raw_email_html?: string | null
          raw_email_text?: string | null
          received_at?: string
          recommended_category?: string | null
          source_email: string
          source_name?: string | null
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          category_confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_category?: string | null
          created_at?: string
          created_entity_id?: string | null
          created_entity_type?: string | null
          event_id?: string | null
          id?: string
          merged_with_entity_id?: string | null
          notes?: string | null
          parsed_company?: Json | null
          parsed_contacts?: Json | null
          parsed_summary?: Json | null
          potential_duplicates?: Json | null
          raw_email_html?: string | null
          raw_email_text?: string | null
          received_at?: string
          recommended_category?: string | null
          source_email?: string
          source_name?: string | null
          source_subject?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_email_imports_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_email_imports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_email_imports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      pending_ticket_transfers: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          initiated_by_email: string
          new_holder_email: string
          new_holder_name: string
          old_holder_email: string | null
          old_holder_name: string | null
          ticket_id: string
          verification_token: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          initiated_by_email: string
          new_holder_email: string
          new_holder_name: string
          old_holder_email?: string | null
          old_holder_name?: string | null
          ticket_id: string
          verification_token: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          initiated_by_email?: string
          new_holder_email?: string
          new_holder_name?: string
          old_holder_email?: string | null
          old_holder_name?: string | null
          ticket_id?: string
          verification_token?: string
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
      photo_access_log: {
        Row: {
          action: string
          created_at: string
          email: string | null
          id: string
          ip_address: string | null
          succeeded: boolean
        }
        Insert: {
          action: string
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          email?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
        }
        Relationships: []
      }
      photo_invite_requests: {
        Row: {
          created_at: string
          email: string
          event_id: string | null
          id: string
          ip_address: string | null
          name: string | null
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          name?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string | null
          id?: string
          ip_address?: string | null
          name?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: []
      }
      pipeline_configs: {
        Row: {
          color: string | null
          created_at: string
          default_view: string | null
          description: string | null
          display_order: number | null
          event_id: string | null
          has_contacts: boolean | null
          has_contracts: boolean | null
          has_documents: boolean | null
          has_email: boolean | null
          has_kanban: boolean | null
          has_ownership: boolean | null
          has_payments: boolean | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          name_plural: string
          name_singular: string
          slug: string
          table_name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_view?: string | null
          description?: string | null
          display_order?: number | null
          event_id?: string | null
          has_contacts?: boolean | null
          has_contracts?: boolean | null
          has_documents?: boolean | null
          has_email?: boolean | null
          has_kanban?: boolean | null
          has_ownership?: boolean | null
          has_payments?: boolean | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_plural: string
          name_singular: string
          slug: string
          table_name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          default_view?: string | null
          description?: string | null
          display_order?: number | null
          event_id?: string | null
          has_contacts?: boolean | null
          has_contracts?: boolean | null
          has_documents?: boolean | null
          has_email?: boolean | null
          has_kanban?: boolean | null
          has_ownership?: boolean | null
          has_payments?: boolean | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_plural?: string
          name_singular?: string
          slug?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_configs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_configs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      pipeline_field_configs: {
        Row: {
          created_at: string
          default_value: string | null
          display_order: number
          field_key: string
          field_label: string
          field_options: Json | null
          field_type: Database["public"]["Enums"]["pipeline_field_type"]
          help_text: string | null
          id: string
          is_required: boolean
          is_standard: boolean
          pipeline_type: string
          placeholder: string | null
          show_in_table: boolean
          show_on_card: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          field_key: string
          field_label: string
          field_options?: Json | null
          field_type?: Database["public"]["Enums"]["pipeline_field_type"]
          help_text?: string | null
          id?: string
          is_required?: boolean
          is_standard?: boolean
          pipeline_type: string
          placeholder?: string | null
          show_in_table?: boolean
          show_on_card?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          field_key?: string
          field_label?: string
          field_options?: Json | null
          field_type?: Database["public"]["Enums"]["pipeline_field_type"]
          help_text?: string | null
          id?: string
          is_required?: boolean
          is_standard?: boolean
          pipeline_type?: string
          placeholder?: string | null
          show_in_table?: boolean
          show_on_card?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_fields: {
        Row: {
          column_width: number | null
          created_at: string
          default_value: string | null
          display_order: number | null
          field_group: string | null
          field_type: string
          id: string
          is_required: boolean | null
          is_system: boolean | null
          max_length: number | null
          max_value: number | null
          min_value: number | null
          name: string
          options: Json | null
          pipeline_id: string
          placeholder: string | null
          show_in_card: boolean | null
          show_in_form: boolean | null
          show_in_table: boolean | null
          slug: string
          updated_at: string
        }
        Insert: {
          column_width?: number | null
          created_at?: string
          default_value?: string | null
          display_order?: number | null
          field_group?: string | null
          field_type: string
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_value?: number | null
          name: string
          options?: Json | null
          pipeline_id: string
          placeholder?: string | null
          show_in_card?: boolean | null
          show_in_form?: boolean | null
          show_in_table?: boolean | null
          slug: string
          updated_at?: string
        }
        Update: {
          column_width?: number | null
          created_at?: string
          default_value?: string | null
          display_order?: number | null
          field_group?: string | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          is_system?: boolean | null
          max_length?: number | null
          max_value?: number | null
          min_value?: number | null
          name?: string
          options?: Json | null
          pipeline_id?: string
          placeholder?: string | null
          show_in_card?: boolean | null
          show_in_form?: boolean | null
          show_in_table?: boolean | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_fields_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          note_type: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          note_type?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          note_type?: string | null
        }
        Relationships: []
      }
      pipeline_payments: {
        Row: {
          created_at: string
          created_by: string | null
          deposit_amount: number | null
          deposit_notes: string | null
          deposit_sent_at: string | null
          entity_id: string
          event_id: string | null
          final_amount: number | null
          final_notes: string | null
          final_sent_at: string | null
          id: string
          pipeline_config_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_notes?: string | null
          deposit_sent_at?: string | null
          entity_id: string
          event_id?: string | null
          final_amount?: number | null
          final_notes?: string | null
          final_sent_at?: string | null
          id?: string
          pipeline_config_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_notes?: string | null
          deposit_sent_at?: string | null
          entity_id?: string
          event_id?: string | null
          final_amount?: number | null
          final_notes?: string | null
          final_sent_at?: string | null
          id?: string
          pipeline_config_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "pipeline_payments_pipeline_config_id_fkey"
            columns: ["pipeline_config_id"]
            isOneToOne: false
            referencedRelation: "pipeline_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_saved_views: {
        Row: {
          created_at: string
          created_by: string | null
          entity_type: string
          event_id: string
          filters: Json | null
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          sort_config: Json | null
          updated_at: string
          view_mode: string
          visible_columns: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_type: string
          event_id: string
          filters?: Json | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          sort_config?: Json | null
          updated_at?: string
          view_mode?: string
          visible_columns?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_type?: string
          event_id?: string
          filters?: Json | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          sort_config?: Json | null
          updated_at?: string
          view_mode?: string
          visible_columns?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_saved_views_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_saved_views_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      pipeline_stage_configs: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          stages: Json
          updated_at: string | null
          value_label: string
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          id?: string
          stages?: Json
          updated_at?: string | null
          value_label?: string
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          stages?: Json
          updated_at?: string | null
          value_label?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          display_order: number | null
          id: string
          is_positive: boolean | null
          is_terminal: boolean | null
          name: string
          pipeline_id: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_positive?: boolean | null
          is_terminal?: boolean | null
          name: string
          pipeline_id: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_positive?: boolean | null
          is_terminal?: boolean | null
          name?: string
          pipeline_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_auto_fixes: {
        Row: {
          affected_entity: string | null
          affected_id: string | null
          created_at: string
          description: string
          fix_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          status: string
        }
        Insert: {
          affected_entity?: string | null
          affected_id?: string | null
          created_at?: string
          description: string
          fix_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          status?: string
        }
        Update: {
          affected_entity?: string | null
          affected_id?: string | null
          created_at?: string
          description?: string
          fix_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          status?: string
        }
        Relationships: []
      }
      preview_access_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          is_active: boolean
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          name?: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          name?: string
          token?: string
        }
        Relationships: []
      }
      preview_signups: {
        Row: {
          created_at: string
          email: string
          event_id: string | null
          first_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event_id?: string | null
          first_name?: string | null
          id?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string | null
          first_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preview_signups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_signups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      production_email_attachments: {
        Row: {
          created_at: string
          email_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
        }
        Insert: {
          created_at?: string
          email_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Update: {
          created_at?: string
          email_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "production_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      production_email_messages: {
        Row: {
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          id: string
          raw_payload: Json | null
          sent_at: string
          sent_by: string | null
          subject: string | null
          thread_id: string
          to_emails: string[]
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          id?: string
          raw_payload?: Json | null
          sent_at?: string
          sent_by?: string | null
          subject?: string | null
          thread_id: string
          to_emails?: string[]
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          id?: string
          raw_payload?: Json | null
          sent_at?: string
          sent_by?: string | null
          subject?: string | null
          thread_id?: string
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "production_email_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "production_email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      production_email_recipients: {
        Row: {
          click_count: number | null
          clicked_at: string | null
          contact_email: string
          contact_name: string | null
          created_at: string
          email_id: string
          error_message: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          sent_at: string | null
          status: string
          target_id: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          tracking_id: string | null
        }
        Insert: {
          click_count?: number | null
          clicked_at?: string | null
          contact_email: string
          contact_name?: string | null
          created_at?: string
          email_id: string
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          target_id: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          tracking_id?: string | null
        }
        Update: {
          click_count?: number | null
          clicked_at?: string | null
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          email_id?: string
          error_message?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["production_target_type"]
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_email_recipients_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "production_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      production_email_templates: {
        Row: {
          body_html: string
          created_at: string
          created_by: string | null
          email_format: string
          event_id: string | null
          id: string
          name: string
          subject: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          created_by?: string | null
          email_format?: string
          event_id?: string | null
          id?: string
          name: string
          subject: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          email_format?: string
          event_id?: string | null
          id?: string
          name?: string
          subject?: string
          target_type?: Database["public"]["Enums"]["production_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_email_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_email_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      production_email_threads: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_id: string | null
          id: string
          last_message_at: string
          message_count: number
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_id?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          last_message_at?: string
          message_count?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_email_threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_email_threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      production_emails: {
        Row: {
          body_html: string
          created_at: string
          event_id: string
          id: string
          sent_at: string
          sent_by: string | null
          subject: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          template_id: string | null
        }
        Insert: {
          body_html: string
          created_at?: string
          event_id: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          subject: string
          target_type: Database["public"]["Enums"]["production_target_type"]
          template_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          event_id?: string
          id?: string
          sent_at?: string
          sent_by?: string | null
          subject?: string
          target_type?: Database["public"]["Enums"]["production_target_type"]
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "production_emails_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "production_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      promo_code_uses: {
        Row: {
          discount_applied: number
          email: string
          id: string
          promo_code_id: string
          registration_id: string | null
          used_at: string
        }
        Insert: {
          discount_applied?: number
          email: string
          id?: string
          promo_code_id: string
          registration_id?: string | null
          used_at?: string
        }
        Update: {
          discount_applied?: number
          email?: string
          id?: string
          promo_code_id?: string
          registration_id?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_uses_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_uses_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          allowed_ticket_types: string[] | null
          code: string
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          is_single_use: boolean
          is_stackable: boolean | null
          max_quantity_per_use: number | null
          max_uses: number | null
          min_order_amount: number | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          reminder_sent_at: string | null
          second_reminder_sent_at: string | null
          source: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          allowed_ticket_types?: string[] | null
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          is_single_use?: boolean
          is_stackable?: boolean | null
          max_quantity_per_use?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          reminder_sent_at?: string | null
          second_reminder_sent_at?: string | null
          source?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          allowed_ticket_types?: string[] | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          is_single_use?: boolean
          is_stackable?: boolean | null
          max_quantity_per_use?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          reminder_sent_at?: string | null
          second_reminder_sent_at?: string | null
          source?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_entries: {
        Row: {
          created_at: string
          donation_amount: number
          email: string
          entries_count: number
          first_name: string | null
          id: string
          last_name: string | null
          payment_status: string
          phone: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          synced_flodesk: boolean | null
          synced_simpletexting: boolean | null
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          donation_amount?: number
          email: string
          entries_count?: number
          first_name?: string | null
          id?: string
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          synced_flodesk?: boolean | null
          synced_simpletexting?: boolean | null
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          donation_amount?: number
          email?: string
          entries_count?: number
          first_name?: string | null
          id?: string
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          synced_flodesk?: boolean | null
          synced_simpletexting?: boolean | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      recovery_email_sends: {
        Row: {
          created_at: string
          email: string
          id: string
          last_sent_at: string
          scope: string
          send_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          last_sent_at?: string
          scope: string
          send_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          last_sent_at?: string
          scope?: string
          send_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      recovery_email_unsubscribes: {
        Row: {
          email: string
          id: string
          reason: string | null
          scope: string
          source: string | null
          unsubscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          reason?: string | null
          scope?: string
          source?: string | null
          unsubscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          reason?: string | null
          scope?: string
          source?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          admin_id: string
          amount: number
          created_at: string | null
          id: string
          lodging_booking_id: string | null
          reason: string | null
          registration_id: string
          stripe_refund_id: string
          ticket_id: string | null
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string | null
          id?: string
          lodging_booking_id?: string | null
          reason?: string | null
          registration_id: string
          stripe_refund_id: string
          ticket_id?: string | null
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string | null
          id?: string
          lodging_booking_id?: string | null
          reason?: string | null
          registration_id?: string
          stripe_refund_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_lodging_booking_id_fkey"
            columns: ["lodging_booking_id"]
            isOneToOne: false
            referencedRelation: "lodging_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          accommodation_waitlist: boolean | null
          checked_in: boolean | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkout_expires_at: string | null
          checkout_status: string | null
          checkout_synced_at: string | null
          client_ip: string | null
          client_user_agent: string | null
          comp_upgrade_amount: number
          created_at: string | null
          dietary_notes: string | null
          donation_amount: number | null
          email: string
          event_id: string
          fbc: string | null
          fbclid: string | null
          fbp: string | null
          gbraid: string | null
          gclid: string | null
          id: string
          last_payment_error_code: string | null
          last_payment_error_details: Json | null
          last_payment_error_message: string | null
          meta_event_id: string | null
          metadata: Json | null
          name: string
          order_number: string | null
          payment_status: string | null
          phone: string | null
          plus_one_name: string | null
          quantity: number
          recovery_email_sent_at: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          ticket_type: string
          total_amount: number
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          waitlist_notified_at: string | null
          wbraid: string | null
        }
        Insert: {
          accommodation_waitlist?: boolean | null
          checked_in?: boolean | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkout_expires_at?: string | null
          checkout_status?: string | null
          checkout_synced_at?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          comp_upgrade_amount?: number
          created_at?: string | null
          dietary_notes?: string | null
          donation_amount?: number | null
          email: string
          event_id: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          last_payment_error_code?: string | null
          last_payment_error_details?: Json | null
          last_payment_error_message?: string | null
          meta_event_id?: string | null
          metadata?: Json | null
          name: string
          order_number?: string | null
          payment_status?: string | null
          phone?: string | null
          plus_one_name?: string | null
          quantity?: number
          recovery_email_sent_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          ticket_type: string
          total_amount: number
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          waitlist_notified_at?: string | null
          wbraid?: string | null
        }
        Update: {
          accommodation_waitlist?: boolean | null
          checked_in?: boolean | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkout_expires_at?: string | null
          checkout_status?: string | null
          checkout_synced_at?: string | null
          client_ip?: string | null
          client_user_agent?: string | null
          comp_upgrade_amount?: number
          created_at?: string | null
          dietary_notes?: string | null
          donation_amount?: number | null
          email?: string
          event_id?: string
          fbc?: string | null
          fbclid?: string | null
          fbp?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          last_payment_error_code?: string | null
          last_payment_error_details?: Json | null
          last_payment_error_message?: string | null
          meta_event_id?: string | null
          metadata?: Json | null
          name?: string
          order_number?: string | null
          payment_status?: string | null
          phone?: string | null
          plus_one_name?: string | null
          quantity?: number
          recovery_email_sent_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          ticket_type?: string
          total_amount?: number
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          waitlist_notified_at?: string | null
          wbraid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      saved_email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_shared: boolean | null
          name: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          body_html: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          name: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          name?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_job_history: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          job_name: string
          metadata: Json | null
          records_processed: number | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      scheduled_payments: {
        Row: {
          amount: number
          attempt_count: number
          created_at: string
          enrollment_id: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_retry_at: string | null
          paid_at: string | null
          payment_number: number
          scheduled_date: string
          status: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attempt_count?: number
          created_at?: string
          enrollment_id: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          paid_at?: string | null
          payment_number: number
          scheduled_date: string
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attempt_count?: number
          created_at?: string
          enrollment_id?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          paid_at?: string | null
          payment_number?: number
          scheduled_date?: string
          status?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      session_rsvps: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          rsvp_session: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          name: string
          rsvp_session?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          rsvp_session?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      sms_delivery_logs: {
        Row: {
          account_phone: string | null
          carrier: string | null
          contact_phone: string
          created_at: string
          delivered_at: string | null
          delivery_payload: Json | null
          failure_reason: string | null
          id: string
          message_text: string | null
          related_email: string | null
          related_lead_id: string | null
          related_promo_code: string | null
          send_error: string | null
          send_response: Json | null
          send_status: string
          simpletexting_message_id: string | null
          source: string
          undelivered_at: string | null
          updated_at: string
        }
        Insert: {
          account_phone?: string | null
          carrier?: string | null
          contact_phone: string
          created_at?: string
          delivered_at?: string | null
          delivery_payload?: Json | null
          failure_reason?: string | null
          id?: string
          message_text?: string | null
          related_email?: string | null
          related_lead_id?: string | null
          related_promo_code?: string | null
          send_error?: string | null
          send_response?: Json | null
          send_status?: string
          simpletexting_message_id?: string | null
          source?: string
          undelivered_at?: string | null
          updated_at?: string
        }
        Update: {
          account_phone?: string | null
          carrier?: string | null
          contact_phone?: string
          created_at?: string
          delivered_at?: string | null
          delivery_payload?: Json | null
          failure_reason?: string | null
          id?: string
          message_text?: string | null
          related_email?: string | null
          related_lead_id?: string | null
          related_promo_code?: string | null
          send_error?: string | null
          send_response?: Json | null
          send_status?: string
          simpletexting_message_id?: string | null
          source?: string
          undelivered_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_analysis_jobs: {
        Row: {
          analyzed_count: number
          completed_at: string | null
          created_at: string
          current_batch: number | null
          error_message: string | null
          event_id: string
          failed_count: number
          id: string
          started_at: string
          status: string
          total_batches: number | null
          total_photos: number
          updated_at: string
        }
        Insert: {
          analyzed_count?: number
          completed_at?: string | null
          created_at?: string
          current_batch?: number | null
          error_message?: string | null
          event_id: string
          failed_count?: number
          id?: string
          started_at?: string
          status?: string
          total_batches?: number | null
          total_photos?: number
          updated_at?: string
        }
        Update: {
          analyzed_count?: number
          completed_at?: string | null
          created_at?: string
          current_batch?: number | null
          error_message?: string | null
          event_id?: string
          failed_count?: number
          id?: string
          started_at?: string
          status?: string
          total_batches?: number | null
          total_photos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_analysis_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_analysis_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_blackout_dates: {
        Row: {
          created_at: string
          end_date: string
          event_id: string | null
          id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          event_id?: string | null
          id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          event_id?: string | null
          id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_blackout_dates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_blackout_dates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_brand_voice: {
        Row: {
          anti_patterns: Json
          caption_length_guidance: string | null
          created_at: string
          created_by: string | null
          emoji_guidance: string | null
          hashtag_guidance: string | null
          id: string
          is_active: boolean
          message_pillars: Json
          name: string
          notes: string | null
          system_prompt: string
          tone_description: string
          updated_at: string
          version: number
          writing_rules: Json
        }
        Insert: {
          anti_patterns?: Json
          caption_length_guidance?: string | null
          created_at?: string
          created_by?: string | null
          emoji_guidance?: string | null
          hashtag_guidance?: string | null
          id?: string
          is_active?: boolean
          message_pillars?: Json
          name?: string
          notes?: string | null
          system_prompt: string
          tone_description: string
          updated_at?: string
          version?: number
          writing_rules?: Json
        }
        Update: {
          anti_patterns?: Json
          caption_length_guidance?: string | null
          created_at?: string
          created_by?: string | null
          emoji_guidance?: string | null
          hashtag_guidance?: string | null
          id?: string
          is_active?: boolean
          message_pillars?: Json
          name?: string
          notes?: string | null
          system_prompt?: string
          tone_description?: string
          updated_at?: string
          version?: number
          writing_rules?: Json
        }
        Relationships: []
      }
      social_caption_examples: {
        Row: {
          created_at: string
          event_id: string | null
          example_caption: string
          id: string
          photo_context: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          example_caption: string
          id?: string
          photo_context?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          example_caption?: string
          id?: string
          photo_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_caption_examples_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_caption_examples_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_locations: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          instagram_location_id: string | null
          is_default: boolean | null
          name: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          instagram_location_id?: string | null
          is_default?: boolean | null
          name: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          instagram_location_id?: string | null
          is_default?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_photo_sources: {
        Row: {
          created_at: string
          event_id: string | null
          folder_path: string
          id: string
          instagram_handle: string | null
          is_active: boolean | null
          last_synced_at: string | null
          photo_year: number | null
          photographer_name: string | null
          priority: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          folder_path: string
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          photo_year?: number | null
          photographer_name?: string | null
          priority?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          folder_path?: string
          id?: string
          instagram_handle?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          photo_year?: number | null
          photographer_name?: string | null
          priority?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_photo_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_photo_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_photos: {
        Row: {
          approved: boolean | null
          caption_suggestions: Json | null
          created_at: string
          dropbox_file_id: string | null
          dropbox_path: string
          event_id: string | null
          file_name: string
          file_size_bytes: number | null
          height: number | null
          id: string
          last_posted_at: string | null
          metadata: Json | null
          original_height: number | null
          original_width: number | null
          photo_year: number | null
          photographer_handle: string | null
          photographer_name: string | null
          preview_url: string | null
          public_image_url: string | null
          quality_notes: string | null
          quality_score: number | null
          silence_recommended: boolean | null
          source_id: string
          status: string
          storage_path: string | null
          storage_status: string | null
          storage_url: string | null
          sync_error: string | null
          sync_status: string | null
          tags: string[] | null
          temporary_url: string | null
          theme: string | null
          thumbnail_url: string | null
          updated_at: string
          url_expires_at: string | null
          width: number | null
        }
        Insert: {
          approved?: boolean | null
          caption_suggestions?: Json | null
          created_at?: string
          dropbox_file_id?: string | null
          dropbox_path: string
          event_id?: string | null
          file_name: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          last_posted_at?: string | null
          metadata?: Json | null
          original_height?: number | null
          original_width?: number | null
          photo_year?: number | null
          photographer_handle?: string | null
          photographer_name?: string | null
          preview_url?: string | null
          public_image_url?: string | null
          quality_notes?: string | null
          quality_score?: number | null
          silence_recommended?: boolean | null
          source_id: string
          status?: string
          storage_path?: string | null
          storage_status?: string | null
          storage_url?: string | null
          sync_error?: string | null
          sync_status?: string | null
          tags?: string[] | null
          temporary_url?: string | null
          theme?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          url_expires_at?: string | null
          width?: number | null
        }
        Update: {
          approved?: boolean | null
          caption_suggestions?: Json | null
          created_at?: string
          dropbox_file_id?: string | null
          dropbox_path?: string
          event_id?: string | null
          file_name?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          last_posted_at?: string | null
          metadata?: Json | null
          original_height?: number | null
          original_width?: number | null
          photo_year?: number | null
          photographer_handle?: string | null
          photographer_name?: string | null
          preview_url?: string | null
          public_image_url?: string | null
          quality_notes?: string | null
          quality_score?: number | null
          silence_recommended?: boolean | null
          source_id?: string
          status?: string
          storage_path?: string | null
          storage_status?: string | null
          storage_url?: string | null
          sync_error?: string | null
          sync_status?: string | null
          tags?: string[] | null
          temporary_url?: string | null
          theme?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          url_expires_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "social_photos_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "social_photo_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_photos: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          position: number
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          position?: number
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "social_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_schedule_phases: {
        Row: {
          created_at: string
          end_date: string | null
          event_id: string | null
          id: string
          is_active: boolean | null
          phase_name: string
          phase_order: number
          post_days: string[]
          post_time_pt: string
          posts_per_week: number
          random_offset_minutes: number
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          phase_name: string
          phase_order?: number
          post_days?: string[]
          post_time_pt?: string
          posts_per_week?: number
          random_offset_minutes?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          phase_name?: string
          phase_order?: number
          post_days?: string[]
          post_time_pt?: string
          posts_per_week?: number
          random_offset_minutes?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_schedule_phases_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_schedule_phases_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      social_scheduled_posts: {
        Row: {
          approved_caption: string | null
          aspect_ratio: string | null
          caption: string | null
          caption_generated_at: string | null
          caption_skipped: boolean | null
          created_at: string
          cue_post_id: string | null
          error_message: string | null
          event_id: string | null
          facebook_post_id: string | null
          first_comment: string | null
          id: string
          include_photographer_credit: boolean
          instagram_post_id: string | null
          is_carousel: boolean | null
          location_id: string | null
          notes: string | null
          photo_id: string
          publish_error: string | null
          published_at: string | null
          scheduled_for: string
          status: string
          updated_at: string
          use_silence: boolean | null
        }
        Insert: {
          approved_caption?: string | null
          aspect_ratio?: string | null
          caption?: string | null
          caption_generated_at?: string | null
          caption_skipped?: boolean | null
          created_at?: string
          cue_post_id?: string | null
          error_message?: string | null
          event_id?: string | null
          facebook_post_id?: string | null
          first_comment?: string | null
          id?: string
          include_photographer_credit?: boolean
          instagram_post_id?: string | null
          is_carousel?: boolean | null
          location_id?: string | null
          notes?: string | null
          photo_id: string
          publish_error?: string | null
          published_at?: string | null
          scheduled_for: string
          status?: string
          updated_at?: string
          use_silence?: boolean | null
        }
        Update: {
          approved_caption?: string | null
          aspect_ratio?: string | null
          caption?: string | null
          caption_generated_at?: string | null
          caption_skipped?: boolean | null
          created_at?: string
          cue_post_id?: string | null
          error_message?: string | null
          event_id?: string | null
          facebook_post_id?: string | null
          first_comment?: string | null
          id?: string
          include_photographer_credit?: boolean
          instagram_post_id?: string | null
          is_carousel?: boolean | null
          location_id?: string | null
          notes?: string | null
          photo_id?: string
          publish_error?: string | null
          published_at?: string | null
          scheduled_for?: string
          status?: string
          updated_at?: string
          use_silence?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "social_scheduled_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_scheduled_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "social_scheduled_posts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "social_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_scheduled_posts_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "social_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      street_team: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          custom_fields: Json | null
          deal_value: number | null
          email: string | null
          event_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: string | null
          role: string | null
          state: string | null
          street_address: string | null
          street_address_2: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          role?: string | null
          state?: string | null
          street_address?: string | null
          street_address_2?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          role?: string | null
          state?: string | null
          street_address?: string | null
          street_address_2?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "street_team_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "street_team_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      stripe_payment_health_alert_runs: {
        Row: {
          checked_at: string
          id: string
          metadata: Json
          notification_id: string | null
          redirect_starts_count: number
          redirect_threshold_breached: boolean
          setting_id: string | null
          sms_sent: boolean
          verification_failures_count: number
          verification_threshold_breached: boolean
          window_hours: number
        }
        Insert: {
          checked_at?: string
          id?: string
          metadata?: Json
          notification_id?: string | null
          redirect_starts_count?: number
          redirect_threshold_breached?: boolean
          setting_id?: string | null
          sms_sent?: boolean
          verification_failures_count?: number
          verification_threshold_breached?: boolean
          window_hours?: number
        }
        Update: {
          checked_at?: string
          id?: string
          metadata?: Json
          notification_id?: string | null
          redirect_starts_count?: number
          redirect_threshold_breached?: boolean
          setting_id?: string | null
          sms_sent?: boolean
          verification_failures_count?: number
          verification_threshold_breached?: boolean
          window_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "stripe_payment_health_alert_runs_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "stripe_payment_health_alert_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_payment_health_alert_settings: {
        Row: {
          alert_cooldown_minutes: number
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          redirect_starts_threshold: number
          sms_phone: string | null
          updated_at: string
          verification_failures_threshold: number
        }
        Insert: {
          alert_cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          redirect_starts_threshold?: number
          sms_phone?: string | null
          updated_at?: string
          verification_failures_threshold?: number
        }
        Update: {
          alert_cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          redirect_starts_threshold?: number
          sms_phone?: string | null
          updated_at?: string
          verification_failures_threshold?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          conversation: Json | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string | null
          updated_at: string
        }
        Insert: {
          conversation?: Json | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          conversation?: Json | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      survey_config: {
        Row: {
          atmosphere_rating_label: string | null
          attend_again_text: string | null
          created_at: string | null
          description: string | null
          favorite_part_label: string | null
          favorite_part_placeholder: string | null
          food_rating_label: string | null
          id: string
          improvements_label: string | null
          improvements_placeholder: string | null
          music_rating_label: string | null
          overall_rating_label: string
          recommend_text: string | null
          show_atmosphere_rating: boolean | null
          show_attend_again: boolean | null
          show_food_rating: boolean | null
          show_music_rating: boolean | null
          show_recommend: boolean | null
          testimonial_label: string | null
          testimonial_placeholder: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          atmosphere_rating_label?: string | null
          attend_again_text?: string | null
          created_at?: string | null
          description?: string | null
          favorite_part_label?: string | null
          favorite_part_placeholder?: string | null
          food_rating_label?: string | null
          id?: string
          improvements_label?: string | null
          improvements_placeholder?: string | null
          music_rating_label?: string | null
          overall_rating_label?: string
          recommend_text?: string | null
          show_atmosphere_rating?: boolean | null
          show_attend_again?: boolean | null
          show_food_rating?: boolean | null
          show_music_rating?: boolean | null
          show_recommend?: boolean | null
          testimonial_label?: string | null
          testimonial_placeholder?: string | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          atmosphere_rating_label?: string | null
          attend_again_text?: string | null
          created_at?: string | null
          description?: string | null
          favorite_part_label?: string | null
          favorite_part_placeholder?: string | null
          food_rating_label?: string | null
          id?: string
          improvements_label?: string | null
          improvements_placeholder?: string | null
          music_rating_label?: string | null
          overall_rating_label?: string
          recommend_text?: string | null
          show_atmosphere_rating?: boolean | null
          show_attend_again?: boolean | null
          show_food_rating?: boolean | null
          show_music_rating?: boolean | null
          show_recommend?: boolean | null
          testimonial_label?: string | null
          testimonial_placeholder?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          atmosphere_rating: number | null
          created_at: string | null
          email: string
          favorite_part: string | null
          food_rating: number | null
          id: string
          improvements: string | null
          music_rating: number | null
          name: string
          overall_rating: number
          registration_id: string | null
          testimonial: string | null
          updated_at: string | null
          would_attend_again: boolean | null
          would_recommend: boolean | null
        }
        Insert: {
          atmosphere_rating?: number | null
          created_at?: string | null
          email: string
          favorite_part?: string | null
          food_rating?: number | null
          id?: string
          improvements?: string | null
          music_rating?: number | null
          name: string
          overall_rating: number
          registration_id?: string | null
          testimonial?: string | null
          updated_at?: string | null
          would_attend_again?: boolean | null
          would_recommend?: boolean | null
        }
        Update: {
          atmosphere_rating?: number | null
          created_at?: string | null
          email?: string
          favorite_part?: string | null
          food_rating?: number | null
          id?: string
          improvements?: string | null
          music_rating?: number | null
          name?: string
          overall_rating?: number
          registration_id?: string | null
          testimonial?: string | null
          updated_at?: string | null
          would_attend_again?: boolean | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_folder: string | null
          error_message: string | null
          event_id: string | null
          id: string
          job_type: string
          processed_sources: number | null
          started_at: string | null
          status: string
          total_failed: number | null
          total_imported: number | null
          total_skipped: number | null
          total_sources: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_folder?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          job_type?: string
          processed_sources?: number | null
          started_at?: string | null
          status?: string
          total_failed?: number | null
          total_imported?: number | null
          total_skipped?: number | null
          total_sources?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_folder?: string | null
          error_message?: string | null
          event_id?: string | null
          id?: string
          job_type?: string
          processed_sources?: number | null
          started_at?: string | null
          status?: string
          total_failed?: number | null
          total_imported?: number | null
          total_skipped?: number | null
          total_sources?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      ticket_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          registration_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          registration_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          registration_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_access_tokens_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_inventory: {
        Row: {
          comp_quantity: number
          created_at: string | null
          description: string | null
          display_name: string | null
          event_id: string | null
          id: string
          is_active: boolean
          price: number
          reserved_for_offers: number
          sold_quantity: number
          ticket_type: string
          tier: string
          total_quantity: number
          updated_at: string | null
        }
        Insert: {
          comp_quantity?: number
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean
          price?: number
          reserved_for_offers?: number
          sold_quantity?: number
          ticket_type: string
          tier?: string
          total_quantity: number
          updated_at?: string | null
        }
        Update: {
          comp_quantity?: number
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean
          price?: number
          reserved_for_offers?: number
          sold_quantity?: number
          ticket_type?: string
          tier?: string
          total_quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          created_at: string | null
          display_name: string
          event_id: string | null
          id: string
          sort_order: number
          tier_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          event_id?: string | null
          id?: string
          sort_order?: number
          tier_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          event_id?: string | null
          id?: string
          sort_order?: number
          tier_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      ticket_transfers: {
        Row: {
          admin_id: string | null
          created_at: string | null
          id: string
          new_holder_email: string | null
          new_holder_name: string
          old_holder_email: string | null
          old_holder_name: string | null
          ticket_id: string
          transfer_method: string
          undo_expires_at: string | null
          undo_token: string | null
          undone_at: string | null
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          id?: string
          new_holder_email?: string | null
          new_holder_name: string
          old_holder_email?: string | null
          old_holder_name?: string | null
          ticket_id: string
          transfer_method?: string
          undo_expires_at?: string | null
          undo_token?: string | null
          undone_at?: string | null
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          id?: string
          new_holder_email?: string | null
          new_holder_name?: string
          old_holder_email?: string | null
          old_holder_name?: string | null
          ticket_id?: string
          transfer_method?: string
          undo_expires_at?: string | null
          undo_token?: string | null
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_transfers_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          is_active: boolean
          is_publicly_available: boolean
          key: string
          label: string
          max_age: number | null
          max_per_order: number | null
          min_age: number | null
          price: number
          requires_adult_ticket: boolean | null
          short_label: string
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
          valid_days: string[] | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean
          is_publicly_available?: boolean
          key: string
          label: string
          max_age?: number | null
          max_per_order?: number | null
          min_age?: number | null
          price?: number
          requires_adult_ticket?: boolean | null
          short_label: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          valid_days?: string[] | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          is_active?: boolean
          is_publicly_available?: boolean
          key?: string
          label?: string
          max_age?: number | null
          max_per_order?: number | null
          min_age?: number | null
          price?: number
          requires_adult_ticket?: boolean | null
          short_label?: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
          valid_days?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      ticket_waitlist: {
        Row: {
          created_at: string
          email: string
          event_id: string | null
          id: string
          name: string
          notified_at: string | null
          ticket_type: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id?: string | null
          id?: string
          name: string
          notified_at?: string | null
          ticket_type: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string | null
          id?: string
          name?: string
          notified_at?: string | null
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string | null
          event_id: string
          holder_email: string | null
          holder_name: string
          id: string
          is_transferable: boolean
          original_purchaser_email: string | null
          owner_email: string | null
          registration_id: string
          status: string
          ticket_type: string
          transfer_count: number
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id: string
          holder_email?: string | null
          holder_name: string
          id?: string
          is_transferable?: boolean
          original_purchaser_email?: string | null
          owner_email?: string | null
          registration_id: string
          status?: string
          ticket_type: string
          transfer_count?: number
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id?: string
          holder_email?: string | null
          holder_name?: string
          id?: string
          is_transferable?: boolean
          original_purchaser_email?: string | null
          owner_email?: string | null
          registration_id?: string
          status?: string
          ticket_type?: string
          transfer_count?: number
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "tickets_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          initiated_by_email: string
          method: string
          sent_to: string
          ticket_id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          initiated_by_email: string
          method?: string
          sent_to: string
          ticket_id: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          initiated_by_email?: string
          method?: string
          sent_to?: string
          ticket_id?: string
          verified_at?: string | null
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
      upgrade_offers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          registration_id: string
          status: string
          stripe_session_id: string | null
          ticket_ids: string[]
          total_amount: number
          unit_upgrade_price: number
          updated_at: string
          upgrade_from: string
          upgrade_to: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          registration_id: string
          status?: string
          stripe_session_id?: string | null
          ticket_ids: string[]
          total_amount: number
          unit_upgrade_price: number
          updated_at?: string
          upgrade_from?: string
          upgrade_to?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          registration_id?: string
          status?: string
          stripe_session_id?: string | null
          ticket_ids?: string[]
          total_amount?: number
          unit_upgrade_price?: number
          updated_at?: string
          upgrade_from?: string
          upgrade_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "upgrade_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrade_offers_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_contacts: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contracts: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          notes: string | null
          sent_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["vendor_contract_status"]
          title: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["vendor_contract_status"]
          title: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["vendor_contract_status"]
          title?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "vendor_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          contract_id: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          document_type: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["vendor_document_type"]
          expiration_date?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "vendor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          category: Database["public"]["Enums"]["vendor_category"]
          company_name: string | null
          created_at: string
          custom_fields: Json | null
          deal_value: number | null
          email: string | null
          event_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status"] | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          category?: Database["public"]["Enums"]["vendor_category"]
          company_name?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          category?: Database["public"]["Enums"]["vendor_category"]
          company_name?: string | null
          created_at?: string
          custom_fields?: Json | null
          deal_value?: number | null
          email?: string | null
          event_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      volunteer_interests: {
        Row: {
          admin_notes: string | null
          archived_at: string | null
          archived_to_pipeline: string | null
          check_in_location: string | null
          city: string | null
          contacted_at: string | null
          contacted_by: string | null
          contribution_types: string[]
          created_at: string
          email: string
          id: string
          instagram_url: string | null
          message: string | null
          name: string
          notes: string | null
          participation_type: string | null
          phone: string | null
          preferred_contact: string | null
          referral_source: string | null
          shift_assigned: string | null
          status: string
          street_team_activities: string[] | null
          training_completed: boolean | null
          volunteer_days: string[] | null
          volunteer_type: string | null
        }
        Insert: {
          admin_notes?: string | null
          archived_at?: string | null
          archived_to_pipeline?: string | null
          check_in_location?: string | null
          city?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          contribution_types?: string[]
          created_at?: string
          email: string
          id?: string
          instagram_url?: string | null
          message?: string | null
          name: string
          notes?: string | null
          participation_type?: string | null
          phone?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          shift_assigned?: string | null
          status?: string
          street_team_activities?: string[] | null
          training_completed?: boolean | null
          volunteer_days?: string[] | null
          volunteer_type?: string | null
        }
        Update: {
          admin_notes?: string | null
          archived_at?: string | null
          archived_to_pipeline?: string | null
          check_in_location?: string | null
          city?: string | null
          contacted_at?: string | null
          contacted_by?: string | null
          contribution_types?: string[]
          created_at?: string
          email?: string
          id?: string
          instagram_url?: string | null
          message?: string | null
          name?: string
          notes?: string | null
          participation_type?: string | null
          phone?: string | null
          preferred_contact?: string | null
          referral_source?: string | null
          shift_assigned?: string | null
          status?: string
          street_team_activities?: string[] | null
          training_completed?: boolean | null
          volunteer_days?: string[] | null
          volunteer_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_interests_contacted_by_fkey"
            columns: ["contacted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_roles: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          display_order: number | null
          event_id: string | null
          id: string
          is_active: boolean | null
          is_lead_role: boolean
          max_volunteers: number | null
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          is_lead_role?: boolean
          max_volunteers?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          event_id?: string | null
          id?: string
          is_active?: boolean | null
          is_lead_role?: boolean
          max_volunteers?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      volunteer_shift_assignments: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          role_id: string
          shift_id: string
          status: string
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          role_id: string
          shift_id: string
          status?: string
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          role_id?: string
          shift_id?: string
          status?: string
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_shift_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "volunteer_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "volunteer_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_shift_assignments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_shifts: {
        Row: {
          created_at: string
          end_time: string
          event_id: string | null
          id: string
          max_volunteers: number | null
          name: string
          notes: string | null
          role_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          event_id?: string | null
          id?: string
          max_volunteers?: number | null
          name: string
          notes?: string | null
          role_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          event_id?: string | null
          id?: string
          max_volunteers?: number | null
          name?: string
          notes?: string | null
          role_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_shifts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_shifts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "volunteer_shifts_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "volunteer_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          availability: string | null
          category: string | null
          created_at: string
          email: string | null
          event_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          event_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          event_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          registration_id: string | null
          session_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          registration_id?: string | null
          session_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          registration_id?: string | null
          session_id?: string | null
          status?: string
        }
        Relationships: []
      }
      webhook_retry_queue: {
        Row: {
          attempt_count: number
          created_at: string
          dead_letter_id: string | null
          event_id: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          moved_to_dead_letter: boolean | null
          next_retry_at: string
          payload: Json
          status: string
          updated_at: string
          webhook_log_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          dead_letter_id?: string | null
          event_id: string
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          moved_to_dead_letter?: boolean | null
          next_retry_at?: string
          payload: Json
          status?: string
          updated_at?: string
          webhook_log_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          dead_letter_id?: string | null
          event_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          moved_to_dead_letter?: boolean | null
          next_retry_at?: string
          payload?: Json
          status?: string
          updated_at?: string
          webhook_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_retry_queue_dead_letter_id_fkey"
            columns: ["dead_letter_id"]
            isOneToOne: false
            referencedRelation: "dead_letter_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_retry_queue_webhook_log_id_fkey"
            columns: ["webhook_log_id"]
            isOneToOne: false
            referencedRelation: "webhook_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      winecamp_attendees: {
        Row: {
          created_at: string
          email: string | null
          event_id: string | null
          experience_level: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_id?: string | null
          experience_level?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          event_id?: string | null
          experience_level?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "winecamp_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winecamp_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      wineries: {
        Row: {
          category: string | null
          company_name: string | null
          confirmed: boolean | null
          created_at: string
          custom_fields: Json | null
          email: string | null
          event_id: string | null
          facebook_followers: number | null
          facebook_url: string | null
          id: string
          instagram_followers: number | null
          instagram_url: string | null
          meta_id: string | null
          name: string
          notes: string | null
          phone: string | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status"] | null
          ticket_status: string | null
          tiktok_followers: number | null
          tiktok_url: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          category?: string | null
          company_name?: string | null
          confirmed?: boolean | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          event_id?: string | null
          facebook_followers?: number | null
          facebook_url?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_url?: string | null
          meta_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          ticket_status?: string | null
          tiktok_followers?: number | null
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          category?: string | null
          company_name?: string | null
          confirmed?: boolean | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          event_id?: string | null
          facebook_followers?: number | null
          facebook_url?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_url?: string | null
          meta_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status"]
            | null
          ticket_status?: string | null
          tiktok_followers?: number | null
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wineries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wineries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      winery_contacts: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          name: string
          phone: string | null
          role: string | null
          updated_at: string
          winery_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          winery_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          winery_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "winery_contacts_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
      winery_contracts: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          description: string | null
          event_id: string | null
          id: string
          notes: string | null
          sent_at: string | null
          signed_at: string | null
          status: string | null
          title: string
          updated_at: string
          winery_id: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string | null
          title: string
          updated_at?: string
          winery_id: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          signed_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          winery_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "winery_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winery_contracts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "winery_contracts_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
      winery_deliverables: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          event_id: string | null
          id: string
          is_completed: boolean | null
          notes: string | null
          title: string
          updated_at: string
          winery_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          title: string
          updated_at?: string
          winery_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          is_completed?: boolean | null
          notes?: string | null
          title?: string
          updated_at?: string
          winery_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "winery_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "winery_deliverables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "winery_deliverables_winery_id_fkey"
            columns: ["winery_id"]
            isOneToOne: false
            referencedRelation: "wineries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      accommodation_units_public: {
        Row: {
          bed_configuration: string | null
          beds_total: number | null
          has_loft: boolean | null
          id: string | null
          is_family_style: boolean | null
          night_price: number | null
          product_type:
            | Database["public"]["Enums"]["accommodation_product_type"]
            | null
          sleeps_max: number | null
          unit_name: string | null
          zone_key: string | null
        }
        Insert: {
          bed_configuration?: string | null
          beds_total?: number | null
          has_loft?: boolean | null
          id?: string | null
          is_family_style?: boolean | null
          night_price?: number | null
          product_type?:
            | Database["public"]["Enums"]["accommodation_product_type"]
            | null
          sleeps_max?: number | null
          unit_name?: string | null
          zone_key?: string | null
        }
        Update: {
          bed_configuration?: string | null
          beds_total?: number | null
          has_loft?: boolean | null
          id?: string | null
          is_family_style?: boolean | null
          night_price?: number | null
          product_type?:
            | Database["public"]["Enums"]["accommodation_product_type"]
            | null
          sleeps_max?: number | null
          unit_name?: string | null
          zone_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_units_zone_key_fkey"
            columns: ["zone_key"]
            isOneToOne: false
            referencedRelation: "accommodation_zones"
            referencedColumns: ["zone_key"]
          },
        ]
      }
      capacity_tracker: {
        Row: {
          event_id: string | null
          sold_percentage: number | null
          total_available: number | null
          total_capacity: number | null
          total_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_inventory_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      daily_sales_trend: {
        Row: {
          donations: number | null
          event_id: string | null
          orders: number | null
          revenue: number | null
          sale_date: string | null
          tickets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_sales_summary: {
        Row: {
          active_tickets: number | null
          checked_in_count: number | null
          combined_revenue: number | null
          event_date: string | null
          event_id: string | null
          event_title: string | null
          is_active: boolean | null
          lodging_bookings: number | null
          lodging_revenue: number | null
          paid_registrations: number | null
          pending_registrations: number | null
          tickets_sold: number | null
          total_donations: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      lodging_settings_public: {
        Row: {
          lodging_enabled: boolean | null
          lodging_invite_enabled: boolean | null
        }
        Insert: {
          lodging_enabled?: boolean | null
          lodging_invite_enabled?: boolean | null
        }
        Update: {
          lodging_enabled?: boolean | null
          lodging_invite_enabled?: boolean | null
        }
        Relationships: []
      }
      production_pipeline_summary: {
        Row: {
          accepted_count: number | null
          declined_count: number | null
          draft_count: number | null
          entity_type: string | null
          event_id: string | null
          sent_count: number | null
          total_count: number | null
        }
        Relationships: []
      }
      ticket_type_breakdown: {
        Row: {
          event_id: string | null
          inventory_available: number | null
          inventory_sold: number | null
          inventory_total: number | null
          paid_count: number | null
          revenue: number | null
          ticket_type: string | null
          total_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_sales_summary"
            referencedColumns: ["event_id"]
          },
        ]
      }
    }
    Functions: {
      addon_lookup: {
        Args: { p_pin: string; p_query: string }
        Returns: {
          addon_display_name: string
          addon_purchase_id: string
          addon_type: string
          holder_email: string
          holder_name: string
          order_number: string
          redeemed_units: number
          registration_id: string
          total_units: number
        }[]
      }
      addon_redeem: {
        Args: {
          p_addon_purchase_id: string
          p_client_event_id: string
          p_pin: string
          p_station_label: string
          p_unit_index: number
        }
        Returns: {
          addon_display_name: string
          addon_type: string
          holder_name: string
          message: string
          previous_redeemed_at: string
          previous_station: string
          status: string
          total_units: number
          unit_index: number
        }[]
      }
      auto_resolve_incident: {
        Args: { p_incident_id: string; p_notes?: string; p_rule: string }
        Returns: undefined
      }
      box_office_admin_auto_unlock: {
        Args: { p_label?: string }
        Returns: {
          pin: string
          station_label: string
        }[]
      }
      box_office_check_in: {
        Args: {
          p_client_event_id: string
          p_day_key?: string
          p_pin: string
          p_scanned_id: string
          p_station_label: string
        }
        Returns: {
          holder_name: string
          message: string
          previous_check_in: string
          previous_station: string
          registration_id: string
          status: string
          ticket_id: string
          ticket_type: string
        }[]
      }
      box_office_lookup_order: {
        Args: { p_pin: string; p_query: string }
        Returns: {
          checked_in_at: string
          holder_name: string
          order_number: string
          payment_status: string
          registration_id: string
          status: string
          ticket_id: string
          ticket_type: string
        }[]
      }
      box_office_pin_valid: { Args: { p_pin: string }; Returns: boolean }
      box_office_search: {
        Args: { p_pin: string; p_query: string }
        Returns: {
          checked_in_at: string
          holder_email: string
          holder_name: string
          order_number: string
          payment_status: string
          registration_id: string
          ticket_id: string
          ticket_type: string
        }[]
      }
      box_office_station_throughput: {
        Args: never
        Returns: {
          last_scan_at: string
          scans_last_15m: number
          scans_total: number
          station_label: string
        }[]
      }
      box_office_today_count: { Args: { p_pin: string }; Returns: number }
      box_office_undo_check_in: {
        Args: { p_pin: string; p_station_label: string; p_ticket_id: string }
        Returns: {
          holder_name: string
          status: string
          ticket_type: string
        }[]
      }
      box_office_validate_pin: {
        Args: { p_pin: string }
        Returns: {
          label: string
          session_id: string
        }[]
      }
      calculate_retry_delay: {
        Args: { attempt_count: number }
        Returns: string
      }
      check_photo_cron_status: { Args: never; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests?: number
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          resets_at: string
        }[]
      }
      cleanup_abandoned_payment_plans: { Args: never; Returns: number }
      cleanup_old_rate_limits: { Args: never; Returns: number }
      complete_scheduled_job: {
        Args: {
          p_error_message?: string
          p_job_id: string
          p_records_processed?: number
          p_status: string
        }
        Returns: undefined
      }
      current_mytickets_email: { Args: never; Returns: string }
      decrement_zone_inventory: {
        Args: { p_quantity: number; p_zone_key: string }
        Returns: boolean
      }
      expire_stale_crew_bids: { Args: never; Returns: number }
      find_admin_by_email: { Args: { p_email: string }; Returns: string }
      get_active_event_id: { Args: never; Returns: string }
      get_active_popup_promo_code: {
        Args: { p_email: string; p_sources: string[] }
        Returns: {
          code: string
          valid_until: string
        }[]
      }
      get_entity_ownership: {
        Args: { p_entity_id: string; p_entity_type: string; p_event_id: string }
        Returns: {
          collaborator_ids: string[]
          owner_id: string
        }[]
      }
      get_lodging_public_flags: {
        Args: never
        Returns: {
          lodging_enabled: boolean
          lodging_invite_enabled: boolean
        }[]
      }
      get_webhook_health_summary: {
        Args: never
        Returns: {
          completed_today: number
          failed_today: number
          oldest_pending_hours: number
          pending_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_email_click_count: {
        Args: { log_tracking_id: string }
        Returns: undefined
      }
      increment_email_open_count: {
        Args: { log_tracking_id: string }
        Returns: undefined
      }
      increment_lead_click_count: {
        Args: { p_email: string }
        Returns: undefined
      }
      increment_zone_inventory: {
        Args: { p_quantity: number; p_zone_key: string }
        Returns: undefined
      }
      is_email_suppressed: { Args: { p_email: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_admin_email: string
          p_admin_user_id: string
          p_entity_id?: string
          p_entity_name?: string
          p_entity_type: string
          p_ip_address?: string
          p_metadata?: Json
          p_new_value?: Json
          p_old_value?: Json
          p_user_agent?: string
        }
        Returns: string
      }
      lookup_entity_by_email: {
        Args: { p_email: string }
        Returns: {
          entity_id: string
          entity_name: string
          entity_type: string
          match_count: number
        }[]
      }
      mark_incident_remediation: {
        Args: {
          p_incident_id: string
          p_notes?: string
          p_rule?: string
          p_status: string
        }
        Returns: undefined
      }
      mark_incident_sms_sent: {
        Args: { p_incident_id: string }
        Returns: undefined
      }
      mint_my_tickets_session: {
        Args: { p_code?: string; p_email: string; p_last_name?: string }
        Returns: {
          email: string
          expires_at: string
          token: string
        }[]
      }
      mint_my_tickets_session_for_auth: {
        Args: never
        Returns: {
          email: string
          expires_at: string
          token: string
        }[]
      }
      mint_my_tickets_session_from_token: {
        Args: { p_access_token: string }
        Returns: {
          email: string
          expires_at: string
          token: string
        }[]
      }
      move_to_dead_letter: {
        Args: {
          p_error_message: string
          p_operation_type: string
          p_original_id: string
          p_original_table: string
          p_payload: Json
        }
        Returns: string
      }
      queue_webhook_retry: {
        Args: {
          p_error: string
          p_event_id: string
          p_event_type: string
          p_payload: Json
          p_webhook_log_id: string
        }
        Returns: string
      }
      register_entity_email: {
        Args: {
          p_email: string
          p_entity_id: string
          p_entity_name: string
          p_entity_type: string
          p_event_id?: string
          p_import_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      report_incident: {
        Args: {
          p_function_name: string
          p_message: string
          p_sample_context?: Json
          p_sample_stack?: string
          p_severity?: Database["public"]["Enums"]["incident_severity"]
          p_signature: string
          p_source?: string
        }
        Returns: {
          id: string
          is_new: boolean
          last_sms_at: string
          occurrence_count: number
          severity: Database["public"]["Enums"]["incident_severity"]
          status: Database["public"]["Enums"]["incident_status"]
        }[]
      }
      reserve_tickets: {
        Args: { p_quantity: number; p_ticket_type: string }
        Returns: boolean
      }
      schedule_photo_cron: { Args: never; Returns: undefined }
      start_scheduled_job: {
        Args: { p_job_name: string; p_metadata?: Json }
        Returns: string
      }
      unschedule_photo_cron: { Args: never; Returns: undefined }
      validate_contract_signature_access: {
        Args: { p_contract_id: string; p_signer_email: string }
        Returns: boolean
      }
      validate_contract_token: {
        Args: { p_token: string }
        Returns: {
          contract_id: string
        }[]
      }
      validate_custom_offer_token: {
        Args: { p_token: string }
        Returns: string
      }
      validate_preview_token: { Args: { p_token: string }; Returns: boolean }
      validate_ticket_access_token: {
        Args: { p_token: string }
        Returns: {
          registration_id: string
        }[]
      }
      validate_transfer_undo_token: {
        Args: { p_token: string }
        Returns: {
          ticket_id: string
          transfer_id: string
        }[]
      }
      verify_admin_invitation: {
        Args: { invitation_token: string }
        Returns: {
          email: string
          expires_at: string
          id: string
          name: string
          used_at: string
        }[]
      }
    }
    Enums: {
      accommodation_inventory_status:
        | "available"
        | "sold"
        | "held"
        | "reserved"
        | "pending_offer"
        | "assigned"
        | "locked"
      accommodation_product_type: "tent" | "cabin"
      app_role: "admin" | "user"
      artisan_contract_status:
        | "draft"
        | "sent"
        | "signed"
        | "completed"
        | "cancelled"
      artisan_document_type: "coi" | "contract" | "w9" | "portfolio" | "other"
      artist_contact_role:
        | "manager"
        | "agent"
        | "publicist"
        | "tour_manager"
        | "artist_direct"
        | "label_rep"
        | "other"
        | "marketing"
      artist_email_category:
        | "announcement"
        | "logistics"
        | "contracts_admin"
        | "general"
      guest_status: "not_checked_in" | "checked_in" | "cancelled"
      incident_severity: "low" | "medium" | "high" | "critical"
      incident_status: "open" | "acknowledged" | "auto_resolved" | "resolved"
      partner_tier: "bronze" | "silver" | "gold" | "platinum" | "custom"
      person_type: "artist" | "partner" | "staff" | "other"
      pipeline_field_type:
        | "text"
        | "number"
        | "currency"
        | "date"
        | "url"
        | "email"
        | "phone"
        | "select"
        | "multiselect"
        | "boolean"
      pipeline_status:
        | "lead"
        | "in_discussion"
        | "pending_contract"
        | "signed"
        | "contacted"
        | "negotiating"
        | "confirmed"
        | "declined"
      production_target_type:
        | "vendor"
        | "artisan"
        | "volunteer"
        | "partner"
        | "artist"
      vendor_category:
        | "stage"
        | "lighting"
        | "sound"
        | "backline"
        | "catering"
        | "rentals"
        | "security"
        | "sanitation"
        | "transportation"
        | "production"
        | "other"
      vendor_contract_status:
        | "draft"
        | "sent"
        | "signed"
        | "completed"
        | "cancelled"
      vendor_document_type:
        | "coi"
        | "contract"
        | "w9"
        | "rider"
        | "tech_specs"
        | "other"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accommodation_inventory_status: [
        "available",
        "sold",
        "held",
        "reserved",
        "pending_offer",
        "assigned",
        "locked",
      ],
      accommodation_product_type: ["tent", "cabin"],
      app_role: ["admin", "user"],
      artisan_contract_status: [
        "draft",
        "sent",
        "signed",
        "completed",
        "cancelled",
      ],
      artisan_document_type: ["coi", "contract", "w9", "portfolio", "other"],
      artist_contact_role: [
        "manager",
        "agent",
        "publicist",
        "tour_manager",
        "artist_direct",
        "label_rep",
        "other",
        "marketing",
      ],
      artist_email_category: [
        "announcement",
        "logistics",
        "contracts_admin",
        "general",
      ],
      guest_status: ["not_checked_in", "checked_in", "cancelled"],
      incident_severity: ["low", "medium", "high", "critical"],
      incident_status: ["open", "acknowledged", "auto_resolved", "resolved"],
      partner_tier: ["bronze", "silver", "gold", "platinum", "custom"],
      person_type: ["artist", "partner", "staff", "other"],
      pipeline_field_type: [
        "text",
        "number",
        "currency",
        "date",
        "url",
        "email",
        "phone",
        "select",
        "multiselect",
        "boolean",
      ],
      pipeline_status: [
        "lead",
        "in_discussion",
        "pending_contract",
        "signed",
        "contacted",
        "negotiating",
        "confirmed",
        "declined",
      ],
      production_target_type: [
        "vendor",
        "artisan",
        "volunteer",
        "partner",
        "artist",
      ],
      vendor_category: [
        "stage",
        "lighting",
        "sound",
        "backline",
        "catering",
        "rentals",
        "security",
        "sanitation",
        "transportation",
        "production",
        "other",
      ],
      vendor_contract_status: [
        "draft",
        "sent",
        "signed",
        "completed",
        "cancelled",
      ],
      vendor_document_type: [
        "coi",
        "contract",
        "w9",
        "rider",
        "tech_specs",
        "other",
      ],
    },
  },
} as const
