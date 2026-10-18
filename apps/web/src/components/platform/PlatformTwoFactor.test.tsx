// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { PlatformLogin } from "./PlatformLogin";
import { PlatformTwoFactorDialog } from "./PlatformTwoFactorDialog";
import { sr } from "@/i18n/locales/sr";
import { ApiError } from "@/lib/errors";
import "@/i18n";

const strings = sr.platform;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlatformLogin two-factor step", () => {
  it("asks for a code after the password and retries a wrong one", async () => {
    const platformLogin = vi.fn(async () => ({ success: false, twoFactorRequired: true, challenge: "ch-1" }));
    const platformLoginVerify = vi
      .fn()
      .mockResolvedValueOnce({ success: false, twoFactorRequired: true, challenge: "ch-1", error: "Neispravan kod. Pokušajte ponovo." })
      .mockResolvedValueOnce({ success: true, admin: { username: "ops", twoFactorEnabled: true } });
    vi.stubGlobal("api", { platformLogin, platformLoginVerify });
    const onSignedIn = vi.fn();

    render(
      <MemoryRouter>
        <PlatformLogin onSignedIn={onSignedIn} />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(strings.login.username), "ops");
    await userEvent.type(screen.getByLabelText(strings.login.password), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: strings.login.submit }));

    expect(await screen.findByText(strings.login.twoFactorTitle)).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(strings.login.code), "000000");
    await userEvent.click(screen.getByRole("button", { name: strings.login.verify }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Neispravan kod.");

    await userEvent.type(screen.getByLabelText(strings.login.code), "abcde-fgh23");
    await userEvent.click(screen.getByRole("button", { name: strings.login.verify }));
    expect(platformLoginVerify).toHaveBeenLastCalledWith({ challenge: "ch-1", code: "abcde-fgh23" });
    expect(onSignedIn).toHaveBeenCalledWith({ username: "ops", twoFactorEnabled: true });
  });

  it("goes back to the password when the challenge expired", async () => {
    vi.stubGlobal("api", {
      platformLogin: vi.fn(async () => ({ success: false, twoFactorRequired: true, challenge: "ch-1" })),
      platformLoginVerify: vi.fn(async () => ({ success: false, error: "Prijava je istekla. Prijavite se ponovo." })),
    });

    render(
      <MemoryRouter>
        <PlatformLogin onSignedIn={() => undefined} />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(strings.login.username), "ops");
    await userEvent.type(screen.getByLabelText(strings.login.password), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: strings.login.submit }));
    await userEvent.type(await screen.findByLabelText(strings.login.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: strings.login.verify }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Prijava je istekla.");
    expect(screen.getByLabelText(strings.login.password)).toHaveValue("");
  });
});

describe("PlatformTwoFactorDialog", () => {
  it("enrolls with the app and shows the recovery codes once", async () => {
    const confirmPlatformTwoFactor = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Neispravan kod. Pokušajte ponovo.", { status: 422, url: "/platform/auth/2fa/confirm", method: "POST" }))
      .mockResolvedValueOnce({ recoveryCodes: ["abcde-fgh23", "jkmnp-qrs45"] });
    vi.stubGlobal("api", {
      setupPlatformTwoFactor: vi.fn(async () => ({
        secret: "JBSWY3DPEHPK3PXP",
        otpauthUri: "otpauth://totp/Iris%20Backoffice:ops?secret=JBSWY3DPEHPK3PXP",
        qrCode: "data:image/png;base64,AAAA",
      })),
      confirmPlatformTwoFactor,
    });
    const onEnabled = vi.fn();
    const onClose = vi.fn();

    render(<PlatformTwoFactorDialog enabled={false} onEnabled={onEnabled} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.start }));
    expect(await screen.findByAltText(strings.twoFactor.qrAlt)).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSWY3DPEHPK3PXP");

    // Not six digits: checked before sending.
    await userEvent.type(screen.getByLabelText(strings.twoFactor.code), "12");
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.confirm }));
    expect(screen.getByText(strings.twoFactor.codeRequired)).toBeInTheDocument();
    expect(confirmPlatformTwoFactor).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(strings.twoFactor.code));
    await userEvent.type(screen.getByLabelText(strings.twoFactor.code), "000000");
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Neispravan kod.");

    await userEvent.type(screen.getByLabelText(strings.twoFactor.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.confirm }));
    expect(await screen.findByText("abcde-fgh23")).toBeInTheDocument();
    expect(screen.getByText("jkmnp-qrs45")).toBeInTheDocument();
    expect(onEnabled).toHaveBeenCalled();
    // Escape cannot dismiss the codes; only "done" closes.
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: strings.twoFactor.done }));
    expect(onClose).toHaveBeenCalled();
  });

  it("only reports the state when two-factor sign-in is already on", () => {
    vi.stubGlobal("api", {});
    render(<PlatformTwoFactorDialog enabled onEnabled={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent(strings.twoFactor.enabled);
    expect(screen.queryByRole("button", { name: strings.twoFactor.start })).not.toBeInTheDocument();
  });
});
