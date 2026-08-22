import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  AdminCard,
  AdminCardContent,
} from "@/components/admin/AdminCard";
import { AdminButton, AdminInput } from "@/components/admin/AdminUI";
import { AdminLabel, AdminFormField } from "@/components/admin/AdminFormPrimitives";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Min 6 characters"),
  fullName: z.string().min(2, "Required"),
});

const SimpleAdminSignup = () => {
  const { signUp } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", fullName: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setSubmitting(true);
    const { error } = await signUp(values.email, values.password, values.fullName);
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Signup failed");
    } else {
      toast.success("Account created. Ask an existing admin to grant you access.");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[hsl(var(--admin-bg))] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[hsl(var(--admin-hover))] flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-[hsl(var(--admin-text-secondary))]" />
          </div>
          <h1 className="text-xl font-semibold text-[hsl(var(--admin-text))] mb-1">
            Simple Admin Signup
          </h1>
          <p className="text-sm text-[hsl(var(--admin-text-secondary))]">
            Temporary fallback signup page. Enter email and password below.
          </p>
        </div>
        
        <AdminCard>
          <AdminCardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <AdminFormField label="Full name" required>
                      <AdminInput autoComplete="name" {...field} />
                      <FormMessage className="text-xs text-[hsl(var(--admin-error))]" />
                    </AdminFormField>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <AdminFormField label="Email" required>
                      <AdminInput type="email" autoComplete="email" {...field} />
                      <FormMessage className="text-xs text-[hsl(var(--admin-error))]" />
                    </AdminFormField>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <AdminFormField label="Password" required>
                      <AdminInput type="password" autoComplete="new-password" {...field} />
                      <FormMessage className="text-xs text-[hsl(var(--admin-error))]" />
                    </AdminFormField>
                  )}
                />
                <AdminButton 
                  type="submit" 
                  className="w-full" 
                  disabled={submitting}
                  isLoading={submitting}
                >
                  Create account
                </AdminButton>
              </form>
            </Form>
          </AdminCardContent>
        </AdminCard>
      </div>
    </main>
  );
};

export default SimpleAdminSignup;