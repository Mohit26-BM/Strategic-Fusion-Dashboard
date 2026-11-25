import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import AccessBar, { LockedNotice } from "./AccessBar";
import UnlockDialog from "./UnlockDialog";
import { ApiError } from "../services/api";
import { getToken, setToken } from "../services/auth";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return { ...actual, fetchConfig: jest.fn(), checkToken: jest.fn() };
});
const api = require("../services/api");

function Harness() {
  const { handleAuthError, unlocked } = useAuth();
  return (
    <>
      <AccessBar />
      <UnlockDialog />
      {!unlocked && <LockedNotice what="adding nodes" />}
      <button onClick={() => handleAuthError(new ApiError("no", { status: 401, code: "UNAUTHORIZED" }))}>simulate rejected token</button>
      <span data-testid="state">{unlocked ? "unlocked" : "locked"}</span>
    </>
  );
}

const renderAll = () =>
  render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  );

beforeEach(() => {
  window.sessionStorage.clear();
  api.fetchConfig.mockResolvedValue({ writesEnabled: true });
  api.checkToken.mockReset();
});

describe("unlocking", () => {
  it("starts locked: viewing only, with a way to unlock", async () => {
    renderAll();
    expect(await screen.findByText("Viewing only")).toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
    expect(screen.getByText(/adding nodes needs the access token/i)).toBeInTheDocument();
  });

  it("a wrong token is refused with a clear message and nothing is stored", async () => {
    api.checkToken.mockRejectedValue(new ApiError("Invalid", { status: 401, code: "UNAUTHORIZED" }));
    renderAll();
    userEvent.click((await screen.findAllByRole("button", { name: "Unlock editing" }))[0]);
    userEvent.type(screen.getByLabelText("Access token"), "wrong-token-123");
    userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That token is not correct.");
    expect(getToken()).toBe("");
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
  });

  it("the right token unlocks, is kept for this tab, and the dialog closes", async () => {
    api.checkToken.mockResolvedValue({ ok: true });
    renderAll();
    userEvent.click((await screen.findAllByRole("button", { name: "Unlock editing" }))[0]);
    userEvent.type(screen.getByLabelText("Access token"), "the-right-token-1");
    userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("Editing unlocked")).toBeInTheDocument();
    expect(api.checkToken).toHaveBeenCalledWith("the-right-token-1");
    expect(getToken()).toBe("the-right-token-1");
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument();
    expect(screen.queryByText(/adding nodes needs the access token/i)).not.toBeInTheDocument();
  });

  it("the token box is a password field and Escape closes the dialog", async () => {
    renderAll();
    userEvent.click((await screen.findAllByRole("button", { name: "Unlock editing" }))[0]);
    expect(screen.getByLabelText("Access token")).toHaveAttribute("type", "password");
    userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument());
  });

  it("Unlock stays disabled until something is typed", async () => {
    renderAll();
    userEvent.click((await screen.findAllByRole("button", { name: "Unlock editing" }))[0]);
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
  });
});

describe("locking and stale tokens", () => {
  it("Lock forgets the token", async () => {
    setToken("kept-from-before-12");
    renderAll();
    expect(await screen.findByText("Editing unlocked")).toBeInTheDocument();
    userEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(getToken()).toBe("");
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
  });

  it("when the server rejects the saved token, the app locks and asks again with an explanation", async () => {
    setToken("expired-token-1234");
    renderAll();
    await screen.findByText("Editing unlocked");
    userEvent.click(screen.getByRole("button", { name: "simulate rejected token" }));
    expect(await screen.findByText(/not accepted/i)).toBeInTheDocument();
    expect(screen.getByTestId("state")).toHaveTextContent("locked");
    expect(getToken()).toBe("");
  });
});

describe("read-only servers", () => {
  it("say so instead of asking for a token that cannot help", async () => {
    api.fetchConfig.mockResolvedValue({ writesEnabled: false });
    renderAll();
    expect(await screen.findByText(/read-only server/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unlock editing" })).not.toBeInTheDocument();
    expect(screen.getByText(/the server is read-only, so adding nodes is switched off/i)).toBeInTheDocument();
  });

  it("an unreachable server does not pretend to know either way", async () => {
    api.fetchConfig.mockRejectedValue(new ApiError("down", { code: "NETWORK" }));
    renderAll();
    expect(await screen.findByText("Viewing only")).toBeInTheDocument();
  });
});
