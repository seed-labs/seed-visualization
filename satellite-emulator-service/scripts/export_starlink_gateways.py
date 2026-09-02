import json
import re
from pathlib import Path

import pandas as pd
import requests


PROXY_URL = "http://127.0.0.1:7890"

DATASET_NAME = "28hery/starlink-ground-stations"
CONFIG_NAME = "gateways"
SPLIT_NAME = "train"

PARQUET_API_URL = (
    "https://datasets-server.huggingface.co/parquet"
    f"?dataset={DATASET_NAME}"
)

SCRIPT_DIR = Path(__file__).resolve().parent
TMP_DIR = SCRIPT_DIR.parent / "tmp"

TMP_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_FILE = TMP_DIR / "starlink_gateways.json"
SOURCE_FILE = TMP_DIR / "starlink_gateways_source.parquet"

OPERATIONAL_ONLY = True


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def extract_city(name: str) -> str:
    return name.split(",")[0].strip()


def get_proxies() -> dict[str, str]:
    return {
        "http": PROXY_URL,
        "https": PROXY_URL,
    }


def get_real_parquet_url() -> str:
    """
    Fetch the real Parquet file URL from the Hugging Face Dataset Viewer API.
    """
    print("Querying Hugging Face dataset file metadata...")

    response = requests.get(
        PARQUET_API_URL,
        proxies=get_proxies(),
        timeout=30,
        headers={
            "User-Agent": "Mozilla/5.0",
        },
    )
    response.raise_for_status()

    data = response.json()

    parquet_files = data.get("parquet_files", [])

    for file_info in parquet_files:
        if (
            file_info.get("config") == CONFIG_NAME
            and file_info.get("split") == SPLIT_NAME
        ):
            parquet_url = file_info["url"]
            print("Found Parquet file:")
            print(parquet_url)
            return parquet_url

    raise RuntimeError(
        f"Could not find Parquet file for config={CONFIG_NAME}, split={SPLIT_NAME}.\n"
        f"API response: {json.dumps(data, ensure_ascii=False, indent=2)}"
    )


def download_source(parquet_url: str) -> None:
    print("Downloading gateway data...")

    response = requests.get(
        parquet_url,
        proxies=get_proxies(),
        timeout=60,
        headers={
            "User-Agent": "Mozilla/5.0",
        },
        allow_redirects=True,
    )
    response.raise_for_status()

    SOURCE_FILE.write_bytes(response.content)

    print(f"Download complete: {SOURCE_FILE.resolve()}")
    print(f"File size: {SOURCE_FILE.stat().st_size} bytes")


def export_gateways() -> None:
    df = pd.read_parquet(SOURCE_FILE)

    print("Source columns:", list(df.columns))
    print("Source station count:", len(df))

    result = []

    for _, row in df.iterrows():
        status = str(row["status"]).strip().lower()

        if OPERATIONAL_ONLY and status != "operational":
            continue

        source_name = str(row["name"]).strip()
        latitude = float(row["lat"])
        longitude = float(row["lon"])

        index = len(result) + 1

        result.append(
            {
                "id": f"starlink-gs-{index:04d}-{slugify(source_name)}",
                "name": f"Starlink Gateway - {source_name}",
                "city": extract_city(source_name),
                "longitude": round(longitude, 6),
                "latitude": round(latitude, 6),
                "altitudeMeters": 0,
                # "status": status,
            }
        )

    OUTPUT_FILE.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Exported {len(result)} gateways")
    print(f"Output file: {OUTPUT_FILE.resolve()}")


def cleanup_source_file() -> None:
    if SOURCE_FILE.exists():
        SOURCE_FILE.unlink()
        print(f"Deleted intermediate file: {SOURCE_FILE.resolve()}")


if __name__ == "__main__":
    try:
        parquet_url = get_real_parquet_url()
        download_source(parquet_url)
        export_gateways()
    finally:
        cleanup_source_file()
