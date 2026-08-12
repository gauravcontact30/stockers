import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppleModal } from "../../app/components/apple-modal";

describe("AppleModal", () => {
  it("renders nothing when closed and never opened", () => {
    const { container } = render(
      <AppleModal open={false} onClose={jest.fn()} label="Test">
        <p>content</p>
      </AppleModal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mounts, becomes visible, and focuses the panel when opened", async () => {
    render(
      <AppleModal open={true} onClose={jest.fn()} label="Test modal">
        <p>content</p>
      </AppleModal>
    );

    const dialog = screen.getByRole("dialog", { name: "Test modal" });
    expect(dialog).toBeInTheDocument();

    await waitFor(() => expect(dialog.className).toContain("translate-y-0"));
    await waitFor(() => expect(dialog).toHaveFocus());

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("opens after starting closed, exercising the mount transition and null-ref focus path", async () => {
    const { rerender } = render(
      <AppleModal open={false} onClose={jest.fn()} label="Toggle modal">
        <p>content</p>
      </AppleModal>
    );

    rerender(
      <AppleModal open={true} onClose={jest.fn()} label="Toggle modal">
        <p>content</p>
      </AppleModal>
    );

    const dialog = await screen.findByRole("dialog", { name: "Toggle modal" });
    await waitFor(() => expect(dialog.className).toContain("translate-y-0"));
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = jest.fn();
    const { baseElement } = render(
      <AppleModal open={true} onClose={onClose} label="Backdrop close">
        <p>content</p>
      </AppleModal>
    );

    const backdrop = baseElement.querySelector("[aria-hidden]");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <AppleModal open={true} onClose={onClose} label="Close button">
        <p>content</p>
      </AppleModal>
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed while mounted", () => {
    const onClose = jest.fn();
    render(
      <AppleModal open={true} onClose={onClose} label="Escape close">
        <p>content</p>
      </AppleModal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders header and footer render-prop slots when provided", () => {
    render(
      <AppleModal
        open={true}
        onClose={jest.fn()}
        label="With slots"
        header={<span>My Header</span>}
        footer={<span>My Footer</span>}
      >
        <p>body content</p>
      </AppleModal>
    );

    expect(screen.getByText("My Header")).toBeInTheDocument();
    expect(screen.getByText("My Footer")).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("does not render a footer section when footer is omitted", () => {
    const { baseElement } = render(
      <AppleModal open={true} onClose={jest.fn()} label="No footer">
        <p>body content</p>
      </AppleModal>
    );

    expect(baseElement.querySelector(".border-t.border-slate-200\\/70.bg-slate-50\\/70")).toBeNull();
  });

  it("unmounts (removes from DOM) ~220ms after closing, and restores body overflow", async () => {
    const previousOverflow = document.body.style.overflow;
    const { rerender } = render(
      <AppleModal open={true} onClose={jest.fn()} label="Closing modal">
        <p>content</p>
      </AppleModal>
    );

    expect(screen.getByRole("dialog", { name: "Closing modal" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <AppleModal open={false} onClose={jest.fn()} label="Closing modal">
        <p>content</p>
      </AppleModal>
    );

    await waitFor(
      () => expect(screen.queryByRole("dialog", { name: "Closing modal" })).not.toBeInTheDocument(),
      { timeout: 2000 }
    );

    expect(document.body.style.overflow).toBe(previousOverflow);
  });
});
