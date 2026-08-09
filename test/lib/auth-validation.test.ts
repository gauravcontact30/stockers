import {
  MIN_PASSWORD,
  PLAN_NAMES,
  countErrors,
  FIELD_ORDER,
  firstError,
  isMobile,
  isPlanName,
  normaliseMobile,
  passwordProblem,
  validateSignin,
  validateSignup,
  type SignupFields,
} from "../../app/lib/auth-validation";

const good: SignupFields = {
  name: "Aarav Sharma",
  email: "aarav@example.com",
  mobile: "9876543210",
  password: "market2026",
  confirmPassword: "market2026",
};

describe("the plan names", () => {
  it("offers all three plans the product actually sells", () => {
    expect(PLAN_NAMES).toEqual(["Starter", "Pro", "Elite"]);
  });

  it("recognises only those three", () => {
    expect(isPlanName("Elite")).toBe(true);
    expect(isPlanName("Platinum")).toBe(false);
    expect(isPlanName(7)).toBe(false);
  });
});

describe("normaliseMobile", () => {
  /**
   * People type a mobile number every way there is. All of these are the same number, and a form
   * that accepts one and rejects the rest is just a spelling test.
   */
  it("reduces every way a number is written to the same ten digits", () => {
    for (const typed of ["9876543210", "+91 98765 43210", "+919876543210", "09876543210", "98765-43210", "(98765) 43210"]) {
      expect(normaliseMobile(typed)).toBe("9876543210");
    }
  });

  it("leaves something that is not a number alone rather than mangling it", () => {
    expect(normaliseMobile("12345")).toBe("12345");
  });
});

describe("isMobile", () => {
  // TRAI allocates mobile series beginning 6-9 only, so anything else is a typo or a landline and
  // an SMS to it will never arrive.
  it("accepts the series India actually issues mobiles in", () => {
    for (const prefix of ["6", "7", "8", "9"]) expect(isMobile(`${prefix}876543210`)).toBe(true);
  });

  it("rejects a number that could not be a mobile", () => {
    expect(isMobile("5876543210")).toBe(false);
    expect(isMobile("987654321")).toBe(false);
    expect(isMobile("98765432101")).toBe(false);
    expect(isMobile("")).toBe(false);
    expect(isMobile("not a number")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("accepts a password that clears the bar", () => {
    expect(passwordProblem("market2026")).toBeNull();
  });

  /**
   * Eight characters with a letter and a digit. Six was below every current guideline and this
   * account can hold a paid subscription — but the rule stops short of demanding symbols and mixed
   * case, which push people toward one predictable pattern.
   */
  it("names the one thing that is wrong, rather than listing the whole policy", () => {
    expect(passwordProblem("abc1")).toBe(`Use at least ${MIN_PASSWORD} characters.`);
    expect(passwordProblem("12345678")).toBe("Include at least one letter.");
    expect(passwordProblem("abcdefgh")).toBe("Include at least one number.");
  });
});

describe("validateSignup", () => {
  it("passes a complete, valid sign-up", () => {
    expect(validateSignup(good)).toEqual({});
  });

  it("catches a missing or implausible name", () => {
    expect(validateSignup({ ...good, name: "   " }).name).toBe("Please enter your name.");
    expect(validateSignup({ ...good, name: "A" }).name).toBe("That looks too short to be a name.");
    expect(validateSignup({ ...good, name: "x".repeat(81) }).name).toBe("Please use 80 characters or fewer.");
  });

  it("catches a missing or malformed email", () => {
    expect(validateSignup({ ...good, email: "" }).email).toBe("Please enter your email address.");
    expect(validateSignup({ ...good, email: "aarav@example" }).email).toBe("That doesn't look like an email address.");
  });

  // Plus-addressing and long new TLDs are real; a stricter pattern turns away real people.
  it("accepts the addresses a stricter pattern would turn away", () => {
    for (const email of ["a+tag@example.co.in", "first.last@sub.domain.example", "x@y.io"]) {
      expect(validateSignup({ ...good, email }).email).toBeUndefined();
    }
  });

  it("catches a missing or impossible mobile number", () => {
    expect(validateSignup({ ...good, mobile: "" }).mobile).toBe("Please enter your mobile number.");
    expect(validateSignup({ ...good, mobile: "12345" }).mobile).toMatch(/10-digit Indian mobile/);
  });

  it("accepts a mobile typed with a country code or spaces", () => {
    expect(validateSignup({ ...good, mobile: "+91 98765 43210" }).mobile).toBeUndefined();
  });

  it("catches a weak password and a mismatched confirmation separately", () => {
    expect(validateSignup({ ...good, password: "", confirmPassword: "" }).password).toBe("Please choose a password.");
    expect(validateSignup({ ...good, password: "short", confirmPassword: "short" }).password).toMatch(/at least/);
    expect(validateSignup({ ...good, confirmPassword: "" }).confirmPassword).toBe("Please repeat your password.");
    expect(validateSignup({ ...good, confirmPassword: "market2027" }).confirmPassword).toBe(
      "The two passwords don't match.",
    );
  });

  /**
   * No plan is chosen at sign-up. Everyone starts on the free trial, and asking someone to pick
   * between three priced tiers before they have seen a board is asking them to decide with nothing
   * to decide on. `PLAN_NAMES` is still exported for checkout, which is where the choice belongs.
   */
  it("asks for no plan at all", () => {
    expect(FIELD_ORDER).not.toContain("plan");
  });

  // Every problem at once, so a visitor fixes the form in one pass rather than one field per submit.
  it("reports every problem together rather than stopping at the first", () => {
    const errors = validateSignup({ name: "", email: "nope", mobile: "1", password: "x", confirmPassword: "y" });
    expect(countErrors(errors)).toBe(5);
  });
});

describe("validateSignin", () => {
  it("passes a plausible pair", () => {
    expect(validateSignin({ email: "aarav@example.com", password: "anything" })).toEqual({});
  });

  it("catches an empty or malformed address, and an empty password", () => {
    expect(validateSignin({ email: "", password: "x" }).email).toBe("Please enter your email address.");
    expect(validateSignin({ email: "nope", password: "x" }).email).toBe("That doesn't look like an email address.");
    expect(validateSignin({ email: "aarav@example.com", password: "" }).password).toBe("Please enter your password.");
  });

  /**
   * Deliberately thinner than the sign-up rules. An account created under an older policy still
   * has a working password, and refusing to let its owner type it would lock them out of an
   * account they own.
   */
  it("does not hold an existing password to the sign-up strength rules", () => {
    expect(validateSignin({ email: "aarav@example.com", password: "old" })).toEqual({});
  });
});

describe("firstError", () => {
  it("returns the message for the field nearest the top of the form", () => {
    expect(
      firstError({ confirmPassword: "The two passwords don't match.", email: "That doesn't look like an email address." }),
    ).toBe("That doesn't look like an email address.");
  });

  it("returns nothing when the form is clean", () => {
    expect(firstError({})).toBeNull();
  });
});
