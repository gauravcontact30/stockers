import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "../../app/components/contact-form";

/** Fills the visible fields with something valid, leaving the honeypot alone as a person would. */
async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Aarav Sharma");
  await user.type(screen.getByLabelText("Your email"), "aarav@example.com");
  await user.type(
    screen.getByLabelText("Your message"),
    "The one-year return on the movers board looks wrong for RELIANCE.",
  );
}

const accepted = () => ({ ok: true, json: async () => ({ ok: true, delivered: true }) }) as Response;

describe("ContactForm", () => {
  it("sends the enquiry to the contact endpoint", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(accepted());

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/contact");
    expect(JSON.parse(init.body)).toEqual({
      name: "Aarav Sharma",
      email: "aarav@example.com",
      topic: "Support",
      message: "The one-year return on the movers board looks wrong for RELIANCE.",
      company: "",
    });
  });

  it("sends the topic the visitor chose", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(accepted());

    render(<ContactForm />);
    await fillIn(user);
    await user.selectOptions(screen.getByLabelText("What is it about?"), "Privacy");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).topic).toBe("Privacy");
  });

  // Success has to say what happens next, not merely that something happened.
  it("confirms where the reply will go", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(accepted());

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/that reached us/i)).toBeInTheDocument();
    expect(screen.getByText(/aarav@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
  });

  // The server knows why it refused; repeating its reason beats a generic failure message.
  it("shows the reason the server gave for refusing", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Please give us a little more detail — at least 20 characters." }),
    } as Response);

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 20 characters/);
  });

  it("falls back to its own message when the request fails outright", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("falls back to its own message when a refusal carries no reason", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't go through/);
  });

  // A second click while the first is in flight would send the enquiry twice.
  it("disables the button while a send is in flight", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
  });

  // The honeypot is hidden from people and from assistive technology; only a bot fills it.
  it("keeps the honeypot out of sight and sends it empty", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(accepted());

    const { container } = render(<ContactForm />);
    const honeypot = container.querySelector('div[aria-hidden="true"]');
    expect(honeypot).toHaveClass("hidden");
    expect(honeypot?.querySelector("input")).toHaveAttribute("tabindex", "-1");

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).company).toBe("");
  });

  /**
   * What a bot does. `userEvent` refuses to type into a hidden field, quite correctly — so this
   * drives the change directly, which is the only way to exercise the path a script takes.
   */
  it("carries the honeypot's value to the server when something fills it in", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockResolvedValue(accepted());

    const { container } = render(<ContactForm />);
    const honeypot = container.querySelector('div[aria-hidden="true"] input') as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: "Acme Ltd" } });

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).company).toBe("Acme Ltd");
  });

  // Not everything thrown is an Error. A rejection with a bare string must still reach the reader
  // as something readable rather than as "[object Object]".
  it("handles a rejection that is not an Error", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockRejectedValue("socket hang up");

    render(<ContactForm />);
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't go through/);
  });
});
