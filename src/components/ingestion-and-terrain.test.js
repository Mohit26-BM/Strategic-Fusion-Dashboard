import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FileUpload from "./FileUpload";
import TerrainMapControl from "./TerrainMapControl";
import { DEFAULT_TERRAIN_CONFIG } from "../utils/terrain";
import { fitWithin, validateImageFile } from "../utils/imageResize";

const file = (text, name, type = "text/plain") => new File([text], name, { type });
const input = () => document.getElementById("fileInput");

describe("FileUpload (tables)", () => {
  it("previews a CSV with capitalised Latitude/Longitude headers, then imports it on request", async () => {
    const onDataLoaded = jest.fn().mockResolvedValue();
    render(<FileUpload onDataLoaded={onDataLoaded} />);
    userEvent.upload(input(), file("Latitude,Longitude,Title,Type\n28.6,77.2,Delhi,osint\n19.07,72.87,Mumbai,humint", "nodes.csv", "text/csv"));

    const preview = await screen.findByRole("region", { name: "Import preview" });
    expect(preview).toHaveTextContent("2 of 2 rows");
    expect(preview).toHaveTextContent("1 OSINT");
    expect(onDataLoaded).not.toHaveBeenCalled(); // nothing is sent until the person agrees

    userEvent.click(screen.getByRole("button", { name: "Import 2 nodes" }));
    await waitFor(() => expect(onDataLoaded).toHaveBeenCalledTimes(1));
    const [nodes, meta] = onDataLoaded.mock.calls[0];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ lat: 28.6, lng: 77.2, type: "OSINT", title: "Delhi" });
    expect(meta).toMatchObject({ source: "csv", fileName: "nodes.csv", total: 2, skipped: [] });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Import preview" })).not.toBeInTheDocument());
  });

  it("lists the rows that will be skipped, with reasons, before anything is sent", async () => {
    render(<FileUpload onDataLoaded={jest.fn()} />);
    userEvent.upload(input(), file("lat,lng,title\n12.9,77.5,ok\nabc,77,bad\n95,77,far\n,,empty", "messy.csv", "text/csv"));
    const preview = await screen.findByRole("region", { name: "Import preview" });
    expect(preview).toHaveTextContent("1 of 4 rows");
    expect(preview).toHaveTextContent("3 rows will be skipped");
    expect(preview).toHaveTextContent('row 3: latitude "abc" is not a number');
    expect(preview).toHaveTextContent("row 4: latitude 95 is outside -90 to 90");
    expect(preview).toHaveTextContent("row 5: latitude is empty");
  });

  it("when no row is usable, says why and shows no import button", async () => {
    render(<FileUpload onDataLoaded={jest.fn()} />);
    userEvent.upload(input(), file("name,city\nA,B", "nocoords.csv", "text/csv"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/None of the 1 rows could be used.*latitude and longitude columns/s);
    expect(screen.queryByRole("button", { name: /^Import/ })).not.toBeInTheDocument();
  });

  it("refuses unsupported files and broken JSON with a plain message", async () => {
    render(<FileUpload onDataLoaded={jest.fn()} />);
    fireEvent.change(input(), { target: { files: [file("hello", "notes.txt")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unsupported file type/);
    fireEvent.change(input(), { target: { files: [file("{oops", "bad.json", "application/json")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not valid JSON/));
  });

  it("an import that fails shows the reason and keeps the preview so it can be retried", async () => {
    const onDataLoaded = jest.fn().mockRejectedValue(new Error("Cannot reach the server."));
    render(<FileUpload onDataLoaded={onDataLoaded} />);
    userEvent.upload(input(), file("lat,lng\n1,2", "one.csv", "text/csv"));
    userEvent.click(await screen.findByRole("button", { name: "Import 1 nodes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server.");
    expect(screen.getByRole("button", { name: "Import 1 nodes" })).toBeEnabled();
  });

  it("Cancel throws the preview away", async () => {
    render(<FileUpload onDataLoaded={jest.fn()} />);
    userEvent.upload(input(), file("lat,lng\n1,2", "one.csv", "text/csv"));
    await screen.findByRole("region", { name: "Import preview" });
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Import preview" })).not.toBeInTheDocument();
  });
});

describe("image helpers", () => {
  it("fitWithin keeps the proportions and never enlarges", () => {
    expect(fitWithin(1600, 1200, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(1200, 1600, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(200, 150, 1280)).toEqual({ width: 200, height: 150 });
  });

  it("validateImageFile refuses other file types and huge files", () => {
    expect(validateImageFile(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
    expect(validateImageFile(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toMatch(/JPEG, PNG, WebP or GIF/);
    expect(validateImageFile(null)).toMatch(/No file/);
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 });
    expect(validateImageFile(big)).toMatch(/20.0 MB/);
  });
});

describe("TerrainMapControl", () => {
  const config = { ...DEFAULT_TERRAIN_CONFIG, enabled: true, imageUrl: "data:image/png;base64,AAAA", bounds: { south: 5, west: 65, north: 38, east: 98 } };

  it("labels all four edges", () => {
    render(<TerrainMapControl value={config} onChange={jest.fn()} />);
    for (const label of [/^North/, /^South/, /^West/, /^East/]) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("an empty or impossible edge shows a message and is NOT passed on to the map", () => {
    const onChange = jest.fn();
    render(<TerrainMapControl value={config} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/^North/), { target: { value: "" } });
    expect(screen.getByText("North is required")).toBeInTheDocument();
    expect(screen.getByText(/keeps its last valid position/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^North/), { target: { value: "2" } });
    expect(screen.getByText("North must be larger than South")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^North/), { target: { value: "95" } });
    expect(screen.getByText(/between -90 and 90/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a valid edge is passed on as a number", () => {
    const onChange = jest.fn();
    render(<TerrainMapControl value={config} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/^North/), { target: { value: "40.5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...config, bounds: { south: 5, west: 65, north: 40.5, east: 98 } });
  });

  it("warns when nodes would be out of reach", () => {
    render(<TerrainMapControl value={config} onChange={jest.fn()} nodes={[{ lat: 20, lng: 70 }, { lat: 60, lng: 10 }]} />);
    expect(screen.getByText(/1 of 2 nodes are outside this area/)).toBeInTheDocument();
  });

  it("'Fit area to my nodes' is off without nodes, and sets valid edges around them", () => {
    const onChange = jest.fn();
    const { rerender } = render(<TerrainMapControl value={config} onChange={onChange} nodes={[]} />);
    expect(screen.getByRole("button", { name: "Fit area to my nodes" })).toBeDisabled();
    rerender(<TerrainMapControl value={config} onChange={onChange} nodes={[{ lat: 10, lng: 70 }, { lat: 12, lng: 75 }]} />);
    userEvent.click(screen.getByRole("button", { name: "Fit area to my nodes" }));
    const { bounds } = onChange.mock.calls.at(-1)[0];
    expect(bounds.south).toBeLessThan(10);
    expect(bounds.north).toBeGreaterThan(12);
    expect(bounds.west).toBeLessThan(70);
    expect(bounds.east).toBeGreaterThan(75);
  });

  it("the overlay switch needs a picture; removing the picture switches the overlay off", () => {
    const onChange = jest.fn();
    const { rerender } = render(<TerrainMapControl value={DEFAULT_TERRAIN_CONFIG} onChange={onChange} />);
    expect(screen.getByLabelText("Show terrain overlay")).toBeDisabled();
    rerender(<TerrainMapControl value={config} onChange={onChange} />);
    userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...config, imageUrl: "", enabled: false });
  });

  it("shows a storage warning from a failed save", () => {
    render(<TerrainMapControl value={config} onChange={jest.fn()} saveWarning="The overlay will be lost when you reload." />);
    expect(screen.getByRole("status")).toHaveTextContent(/lost when you reload/);
  });
});
