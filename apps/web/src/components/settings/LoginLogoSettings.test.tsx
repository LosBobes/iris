// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LoginLogoSettings, MAX_LOGIN_LOGO_BYTES } from "./LoginLogoSettings";
import { sr } from "@/i18n/locales/sr";
import "@/i18n";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

const strings = sr.settings.loginLogo;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:logo");
  URL.revokeObjectURL = vi.fn();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function chooseFile(file: File): void {
  fireEvent.change(screen.getByTestId("login-logo-input"), { target: { files: [file] } });
}

describe("LoginLogoSettings", () => {
  it("uploads a picked image as base64 and shows it", async () => {
    const getLoginLogo = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }));
    const updateLoginLogo = vi.fn(async () => ({ logoVersion: "abc" }));
    vi.stubGlobal("api", { getLoginLogo, updateLoginLogo });

    render(<LoginLogoSettings />);
    expect(await screen.findByText(strings.empty)).toBeInTheDocument();

    chooseFile(new File(["png"], "logo.png", { type: "image/png" }));

    await waitFor(() =>
      expect(updateLoginLogo).toHaveBeenCalledWith({ contentType: "image/png", data: btoa("png") }),
    );
    expect(await screen.findByRole("img", { name: strings.preview })).toHaveAttribute("src", "blob:logo");
    expect(toastSuccess).toHaveBeenCalledWith(strings.saved);
  });

  it("rejects files the server would refuse, without uploading", async () => {
    const updateLoginLogo = vi.fn();
    vi.stubGlobal("api", { getLoginLogo: vi.fn(async () => null), updateLoginLogo });

    render(<LoginLogoSettings />);
    await screen.findByText(strings.empty);

    chooseFile(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
    chooseFile(new File([new Uint8Array(MAX_LOGIN_LOGO_BYTES + 1)], "big.png", { type: "image/png" }));

    expect(toastError).toHaveBeenCalledWith(strings.wrongType);
    expect(toastError).toHaveBeenCalledWith(strings.tooLarge);
    expect(updateLoginLogo).not.toHaveBeenCalled();
  });

  it("removes the current logo", async () => {
    const getLoginLogo = vi
      .fn()
      .mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }))
      .mockResolvedValueOnce(null);
    const deleteLoginLogo = vi.fn(async () => undefined);
    vi.stubGlobal("api", { getLoginLogo, deleteLoginLogo });

    render(<LoginLogoSettings />);
    fireEvent.click(await screen.findByRole("button", { name: strings.remove }));

    await waitFor(() => expect(deleteLoginLogo).toHaveBeenCalled());
    expect(await screen.findByText(strings.empty)).toBeInTheDocument();
  });
});
