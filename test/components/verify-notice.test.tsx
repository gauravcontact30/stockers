import { render, screen } from "@testing-library/react";
import { VerifyNotice } from "../../app/components/verify-notice";

let search = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));

describe("VerifyNotice", () => {
  beforeEach(() => {
    search = new URLSearchParams();
  });

  it("renders nothing when the URL says nothing about verification", () => {
    const { container } = render(<VerifyNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an outcome it does not recognise", () => {
    // Guards against a hand-edited or stale link putting arbitrary text on the page.
    search = new URLSearchParams("verify=something-else");
    const { container } = render(<VerifyNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms a successful verification", () => {
    search = new URLSearchParams("verify=verified");
    render(<VerifyNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Email confirmed.");
  });

  it("explains a spent or invalid link without alarming the reader", () => {
    search = new URLSearchParams("verify=invalid");
    render(<VerifyNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("already been used or is no longer valid");
  });
});
