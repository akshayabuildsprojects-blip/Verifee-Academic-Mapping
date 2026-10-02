from pathlib import Path
import sys

import fitz


def main() -> None:
    source = Path(sys.argv[1])
    output_dir = Path(".agents/outputs")
    output_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(source)

    for page_index, page in enumerate(document, start=1):
        image = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image.save(output_dir / f"transcript-page-{page_index:02d}.png")

    print(f"Rendered {document.page_count} page(s) for visual inspection.")


if __name__ == "__main__":
    main()