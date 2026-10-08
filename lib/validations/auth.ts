import { z } from "zod";

// Mirrors the API's @IsCampusMartPassword() (guide 1.4 rule 2) and app/lib/data.ts passwordRequirements
export const PASSWORD_MESSAGE =
  "Use at least 8 characters with an uppercase letter, a lowercase letter and a number";

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_MESSAGE)
  .regex(/[a-z]/, PASSWORD_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_MESSAGE)
  .regex(/\d/, PASSWORD_MESSAGE);

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid school email address");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

// D7: school email and password are the only sign-up fields
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

export const resetPasswordSchema = z
  .object({
    code: codeSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

// First error message of a failed parse, for showing under a form
export function firstError(result: { success: boolean; error?: z.ZodError }): string | null {
  return result.success ? null : (result.error?.issues[0]?.message ?? "Check the form");
}
