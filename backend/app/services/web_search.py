"""Web search service using AnySearch API."""

import httpx
import re


ENDPOINT = "https://api.anysearch.com/mcp"
TIMEOUT = 30.0


async def search_web(queries: list[str]) -> list[dict]:
    """
    Perform web searches for multiple queries using AnySearch API.
    Returns list of {"query": str, "results": [{"title": str, "snippet": str, "url": str}]}
    """
    all_results = []
    for query in queries:
        results = await _single_search(query)
        all_results.append({"query": query, "results": results})
    return all_results


async def _single_search(query: str, max_results: int = 6) -> list[dict]:
    """Perform a single web search using AnySearch API."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "search",
            "arguments": {"query": query, "max_results": max_results}
        }
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            r = await client.post(ENDPOINT, json=payload)
            if r.status_code != 200:
                return [{"title": "", "url": "", "snippet": f"Search error: {r.status_code}"}]

            data = r.json()
            if "error" in data:
                return [{"title": "", "url": "", "snippet": f"API error: {data['error']}"}]

            text = data["result"]["content"][0]["text"]
            return _parse_markdown_results(text)

    except Exception as e:
        return [{"title": "", "url": "", "snippet": f"Search failed: {e}"}]


def _parse_markdown_results(md_text: str) -> list[dict]:
    """Parse AnySearch markdown output into structured list."""
    results = []
    current_title = None
    current_url = ""
    current_snippet = ""
    pending_snippet_lines = []

    for line in md_text.split("\n"):
        line_stripped = line.strip()

        # Title line: "### N. Title Name"
        title_m = re.match(r"^###\s+\d+\.\s+(.+)$", line_stripped)
        if title_m:
            # Save previous result
            if current_title is not None:
                results.append({
                    "title": current_title,
                    "url": current_url.strip(),
                    "snippet": current_snippet.strip()
                })
            current_title = title_m.group(1).strip()
            current_url = ""
            current_snippet = ""
            pending_snippet_lines = []
            continue

        # URL line: "- **URL**: https://..."
        url_m = re.match(r"^-\s+\*\*URL\*\*:\s*(.+)$", line_stripped)
        if url_m:
            current_url = url_m.group(1).strip()
            continue

        # Snippet line: "- Actual snippet text" (not URL, not metadata)
        if line_stripped.startswith("- ") and not line_stripped.startswith("- **"):
            snippet_text = line_stripped[2:].strip()
            if snippet_text and not snippet_text.startswith("##"):
                current_snippet = snippet_text
            continue

    # Append last result
    if current_title is not None:
        results.append({
            "title": current_title,
            "url": current_url.strip(),
            "snippet": current_snippet.strip()
        })

    return results
