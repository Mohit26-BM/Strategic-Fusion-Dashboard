import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog, EditNodeDialog, NotificationDialog, changedFields } from "./ActionDialogs";
import AddNodeForm, { validateNodeForm } from "./AddNodeForm";

const node = { _id: "1", title: "Harbour", type: "IMINT", lat: 13.08, lng: 80.27, source: "sat", image_url: "https://x/y.png", description: "d" };
const form = (over = {}) => ({ title: "Harbour", type: "IMINT", lat: 13.08, lng: 80.27, source: "sat", image_url: "https://x/y.png", description: "d", ...over });

describe("changedFields (only real changes are sent)", () => {
  it("sends nothing when nothing changed", () => {
    expect(changedFields(node, form())).toEqual({});
    expect(changedFields(node, form({ title: "  Harbour " }))).toEqual({});
  });

  it("sends just the fields that changed", () => {
    expect(changedFields(node, form({ title: "New", description: "e" }))).toEqual({ title: "New", description: "e" });
  });

  it("moving a node sends both coordinates (so the place name is looked up again); an untouched position sends neither", () => {
    expect(changedFields(node, form({ lat: "14" }))).toEqual({ lat: 14, lng: 80.27 });
    expect(changedFields(node, form())).not.toHaveProperty("lat");
  });

  it("an uploaded (embedded) picture is kept unless a new link is typed", () => {
    const withPhoto = { ...node, image_url: "data:image/jpeg;base64,AAAA" };
    expect(changedFields(withPhoto, form({ image_url: "" }))).toEqual({});
    expect(changedFields(withPhoto, form({ image_url: "https://new/p.png" }))).toEqual({ image_url: "https://new/p.png" });
  });

  it("clearing a normal link is a change", () => {
    expect(changedFields(node, form({ image_url: "" }))).toEqual({ image_url: "" });
  });
});

describe("EditNodeDialog", () => {
  it("sends only what changed, then waits for the save", async () => {
    const onSave = jest.fn().mockResolvedValue();
    render(<EditNodeDialog node={node} onCancel={jest.fn()} onSave={onSave} />);
    const title = screen.getByLabelText("Title");
    expect(title).toHaveFocus();
    userEvent.clear(title);
    userEvent.type(title, "Harbour 2");
    userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: "Harbour 2" }));
  });

  it("closes without saving when nothing changed", () => {
    const onSave = jest.fn();
    const onCancel = jest.fn();
    render(<EditNodeDialog node={node} onCancel={onCancel} onSave={onSave} />);
    userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("refuses impossible coordinates and an empty title, with a message", () => {
    const onSave = jest.fn();
    render(<EditNodeDialog node={node} onCancel={jest.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "123" } });
    userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/between -90 and 90/);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  " } });
    userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/title cannot be empty/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not pour an uploaded picture (hundreds of KB of text) into a text box", () => {
    render(<EditNodeDialog node={{ ...node, image_url: "data:image/jpeg;base64," + "A".repeat(5000) }} onCancel={jest.fn()} onSave={jest.fn()} />);
    const box = screen.getByLabelText("Image URL");
    expect(box.value).toBe("");
    expect(box.placeholder).toMatch(/uploaded image/i);
  });

  it("keeps a custom type instead of silently changing it to the first one in the list", () => {
    render(<EditNodeDialog node={{ ...node, type: "GEOINT" }} onCancel={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByLabelText("Type")).toHaveValue("GEOINT");
  });

  it("Escape closes it", () => {
    const onCancel = jest.fn();
    render(<EditNodeDialog node={node} onCancel={onCancel} onSave={jest.fn()} />);
    userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("notification and confirm dialogs", () => {
  it("an error is announced as an alert dialog, lists details, and Escape closes it", () => {
    const onClose = jest.fn();
    render(<NotificationDialog notification={{ type: "error", title: "Import failed", message: "Nothing saved", details: ["row 3: bad"] }} onClose={onClose} />);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName("Import failed");
    expect(screen.getByText("row 3: bad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("delete confirmation focuses Cancel (the safe choice) and Escape cancels", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(<ConfirmDialog dialog={{ title: "Delete this node?", message: "Gone for good", confirmLabel: "Delete node" }} onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("render nothing when there is nothing to show", () => {
    const { container } = render(<><NotificationDialog notification={null} onClose={jest.fn()} /><ConfirmDialog dialog={null} onCancel={jest.fn()} onConfirm={jest.fn()} /></>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AddNodeForm", () => {
  it("validateNodeForm names each problem", () => {
    const empty = { lat: "", lng: "", type: "OSINT", title: "", description: "", image_url: "" };
    expect(Object.keys(validateNodeForm(empty)).sort()).toEqual(["lat", "lng", "title"]);
    expect(validateNodeForm({ ...empty, title: "t", lat: "91", lng: "-181" })).toEqual({ lat: "Latitude must be between -90 and 90.", lng: "Longitude must be between -180 and 180." });
    expect(validateNodeForm({ ...empty, title: "t", lat: "1", lng: "1", image_url: "javascript:alert(1)" }).image_url).toMatch(/http/);
    expect(validateNodeForm({ ...empty, title: "t", lat: "1", lng: "1", image_url: "https://ok/x.png" })).toEqual({});
  });

  it("shows inline messages instead of an alert() box, and does not submit", () => {
    const onAdd = jest.fn();
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    render(<AddNodeForm onAdd={onAdd} />);
    userEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(screen.getByText("Latitude is required.")).toBeInTheDocument();
    expect(screen.getByText("Give the node a title.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("sends clean numbers and an uppercase type, then clears the form", async () => {
    const onAdd = jest.fn().mockResolvedValue(true);
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "28.6139" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "77.209" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Delhi relay  " } });
    userEvent.click(screen.getByRole("button", { name: "Add node" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ lat: 28.6139, lng: 77.209, type: "OSINT", title: "Delhi relay", description: "", image_url: "" }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));
  });

  it("keeps what was typed when saving failed, so nothing has to be retyped", async () => {
    const onAdd = jest.fn().mockResolvedValue(false);
    render(<AddNodeForm onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep me" } });
    userEvent.click(screen.getByRole("button", { name: "Add node" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Add node" })).toBeEnabled());
    expect(screen.getByLabelText("Title")).toHaveValue("Keep me");
  });
});
