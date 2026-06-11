import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderMarkdownLite } from "./markdownLite";

function renderText(text: string) {
  return render(<div data-testid="md">{renderMarkdownLite(text)}</div>);
}

describe("renderMarkdownLite", () => {
  it("renders **bold** as strong without literal asterisks", () => {
    renderText("The suffix **ne** marks location.");
    expect(screen.getByText("ne").tagName).toBe("STRONG");
    expect(screen.getByTestId("md").textContent).not.toContain("*");
  });

  it("renders *italic* and `code` spans", () => {
    renderText("Use *talu* with `ne`.");
    expect(screen.getByText("talu").tagName).toBe("EM");
    expect(screen.getByText("ne").tagName).toBe("CODE");
  });

  it("renders bullet and numbered lines as a list", () => {
    renderText("- first point\n- second point");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["first point", "second point"]);
    renderText("1. one\n2) two");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("splits double newlines into paragraphs and keeps single newlines as breaks", () => {
    const { container } = renderText("first paragraph\n\nsecond paragraph\nwith a break");
    expect(container.querySelectorAll("p").length).toBe(2);
    expect(container.querySelectorAll("br").length).toBe(1);
  });

  it("renders markup-like model output as inert text, never HTML", () => {
    const { container } = renderText("<img src=x onerror=alert(1)> and **safe**");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("leaves unmatched asterisks untouched", () => {
    renderText("a * b and 2*3");
    expect(screen.getByTestId("md").textContent).toBe("a * b and 2*3");
  });
});
