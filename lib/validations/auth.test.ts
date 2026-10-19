import { describe, expect, it } from "vitest";
import { passwordRequirements } from "@/app/lib/data";
import { passwordSchema, signUpSchema } from "./auth";

// Same cases as backend/src/auth/decorators/is-campusmart-password.decorator.spec.ts
const valid = ["Campus2026", "aB3defgh", "Very long Passphrase 9"];
const invalid = ["aB3defg", "campus2026", "CAMPUS2026", "CampusMart"];

describe("password policy mirrors the API", () => {
  it.each(valid)("accepts %p", (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(true);
    expect(passwordRequirements.every((r) => r.test(p))).toBe(true);
  });

  it.each(invalid)("rejects %p", (p) => {
    expect(passwordSchema.safeParse(p).success).toBe(false);
    expect(passwordRequirements.every((r) => r.test(p))).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("needs only school email, password and confirmation", () => {
    const parsed = signUpSchema.parse({
      email: " Ada@Students.Unilag.edu.ng ",
      password: "Campus2026",
      confirmPassword: "Campus2026",
    });
    expect(parsed).toEqual({
      email: "ada@students.unilag.edu.ng",
      password: "Campus2026",
      confirmPassword: "Campus2026",
    });
  });

  it("rejects mismatched passwords", () => {
    const result = signUpSchema.safeParse({
      email: "ada@unilag.edu.ng",
      password: "Campus2026",
      confirmPassword: "Campus2027",
    });
    expect(result.success).toBe(false);
  });
});
