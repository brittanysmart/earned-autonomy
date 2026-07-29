#!/usr/bin/env python3
"""
Figma snapshot fetcher: pulls one component set into a data/*.md source.

Plumb's other sources are committed markdown snapshots (data/*.md), not live API
calls, so the deployed demo stays static and secret-free. This script is the
one-time (or run-when-you-want-a-refresh) step that produces a Figma snapshot in
that same shape: run it locally with a personal access token, commit the result,
and audit.py picks it up like any other source. It does not run as part of the
audit itself.

Usage:
    FIGMA_TOKEN=figd_... python fetch_figma.py <file_key> [--set-name Badge]
    FIGMA_TOKEN=figd_... python fetch_figma.py <file_key> --node-id 5002-1796
    FIGMA_TOKEN=figd_... python fetch_figma.py <file_key> --description "..."

<file_key> is the id in a Figma file URL: figma.com/design/<file_key>/...
--node-id targets one exact component set (read off the URL's ?node-id=
param when you select it in Figma), for when a file has more than one set
sharing the same name and matching by name alone is ambiguous.
--description supplies the description text directly instead of reading it
from Figma, for when it was typed onto an individual variant instead of the
component set itself and the API has no way to surface it from there.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

# A #<node-id> suffix distinguishes properties with the same name across
# components in Figma's API; it's an implementation detail, not part of the
# name a person would recognize or type.
PROP_SUFFIX_RE = re.compile(r"#[\d:]+$")


def fetch_file(file_key, token):
    req = urllib.request.Request(
        f"https://api.figma.com/v1/files/{file_key}",
        headers={"X-Figma-Token": token},
    )
    # One request for the whole file. A large community kit's JSON can run into
    # the tens of MB and take a while; acceptable for a run-when-you-want-it
    # snapshot script. If that ever hurts, re-fetch with ?ids=<node_id> once the
    # component set's node id is known from a first run.
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def find_component_set(file_json, set_name):
    """Return (node_id, meta) for the componentSet matching set_name, or exit with a
    list of what's actually in the file if nothing matches.

    Kits commonly duplicate a whole page (Base UI vs Radix, light vs dark), which
    means more than one set can share the same name. When that happens, prefer
    whichever one actually has a description over an empty one, since that's
    almost always the one a person meant to fill in and point this at."""
    sets = file_json.get("componentSets", {})
    matches = [
        (node_id, meta)
        for node_id, meta in sets.items()
        if meta.get("name", "").strip().lower() == set_name.strip().lower()
    ]
    if not matches:
        names = sorted(meta.get("name", "?") for meta in sets.values())
        print(f"No component set named '{set_name}' found. Sets in this file:")
        for name in names:
            print(f"  - {name}")
        sys.exit(1)
    if len(matches) == 1:
        return matches[0]

    document = file_json.get("document", {})
    described = [
        (node_id, meta)
        for node_id, meta in matches
        if raw_description(meta, find_node(document, node_id) or {}) is not None
    ]
    if len(described) == 1:
        node_id, meta = described[0]
        print(f"Multiple component sets named '{set_name}'; using the one with a description ({node_id}).")
        return node_id, meta

    print(
        f"Multiple component sets named '{set_name}'; using the first. "
        f"All node ids: {[m[0] for m in matches]}. Pass --node-id to target one exactly."
    )
    return matches[0]


def component_set_by_node_id(file_json, node_id):
    """Return (node_id, meta) for one exact componentSet id, or exit with a
    helpful diagnosis (rather than a bare "not found") when the id turns out
    to belong to something else, e.g. an individual variant selected in
    Figma instead of the parent component set."""
    sets = file_json.get("componentSets", {})
    meta = sets.get(node_id)
    if meta is not None:
        return node_id, meta

    node = find_node(file_json.get("document", {}), node_id)
    if node is None:
        print(f"No node with id {node_id} exists in this file at all. Double-check the node-id in the URL.")
    else:
        print(
            f"Node {node_id} is a {node.get('type', 'unknown')} named '{node.get('name', '?')}', "
            "not a component set. In Figma, select the component set's own frame (the one with "
            "the four-diamond icon that contains all the variants) rather than a single variant, "
            "then copy its link."
        )
    sys.exit(1)


def resolve_node_id(raw):
    """Figma URLs write node ids with a hyphen (5002-1796); the API and document
    tree use a colon (5002:1796)."""
    return raw.replace("-", ":")


def find_node(tree, node_id):
    """Depth-first search for a node by id, wherever it sits in the document."""
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        found = find_node(child, node_id)
        if found is not None:
            return found
    return None


def strip_prop_suffix(name):
    return PROP_SUFFIX_RE.sub("", name)


def extract_variants(node, prop_defs):
    """Prefer the declared VARIANT property literally named 'variant'; fall back to
    any VARIANT-type property, then to parsing child instance names directly."""
    variant_props = {
        strip_prop_suffix(name): defn
        for name, defn in prop_defs.items()
        if defn.get("type") == "VARIANT"
    }
    named_variant = variant_props.get("variant") or variant_props.get("Variant")
    if named_variant and named_variant.get("variantOptions"):
        return named_variant["variantOptions"]
    for defn in variant_props.values():
        if defn.get("variantOptions"):
            return defn["variantOptions"]

    # No usable variantOptions on the properties, so read them off the variant
    # children's names instead (Figma names them "prop=value, prop2=value2").
    values = []
    for child in node.get("children", []):
        for part in child.get("name", "").split(","):
            if "=" in part:
                key, _, value = part.strip().partition("=")
                if key.strip().lower() == "variant" and value.strip() not in values:
                    values.append(value.strip())
    return values


def render_properties_table(prop_defs):
    rows = []
    for raw_name, defn in prop_defs.items():
        name = strip_prop_suffix(raw_name)
        prop_type = defn.get("type", "unknown")
        default = defn.get("defaultValue", "")
        options = ", ".join(defn.get("variantOptions", []) or [])
        rows.append((name, prop_type, str(default), options))
    if not rows:
        return "_No component properties declared on this set._"
    lines = ["| Property | Type | Default | Options |", "|----------|------|---------|---------|"]
    for name, prop_type, default, options in rows:
        lines.append(f"| {name} | {prop_type} | {default} | {options} |")
    return "\n".join(lines)


def raw_description(set_meta, node):
    """The set's real description, if it has one, else None.

    The componentSets summary's description is "as entered by the publisher"
    per Figma's docs, which reads like it only fills in once a component is
    published to a library. The document tree node itself carries a
    "description" set directly in the editor regardless of publish status,
    so fall back to that when the summary comes back empty.
    """
    return set_meta.get("description", "").strip() or node.get("description", "").strip() or None


def resolve_description(set_meta, node):
    return raw_description(set_meta, node) or "(no description set on the component set)"


def render_snapshot(file_key, file_json, set_meta, node, today, description_override=None):
    # Figma exposes a component set's description in two different places
    # depending on publish state (see resolve_description), and a description
    # typed onto one variant inside the set instead of the set itself won't
    # surface in either. --description sidesteps that lookup entirely: the
    # variants and properties below still come straight from the live API,
    # only this one field is supplied directly.
    description = description_override or resolve_description(set_meta, node)
    variants = extract_variants(node, node.get("componentPropertyDefinitions", {}))
    variant_lines = "\n".join(f"- {v}" for v in variants) or "- (none declared)"
    properties_table = render_properties_table(node.get("componentPropertyDefinitions", {}))
    file_name = file_json.get("name", "unknown")
    last_modified = file_json.get("lastModified", "unknown")

    return f"""---
source: www.figma.com/design/{file_key}
authority: design_source
last_fetched: {today}
owner: Design team - Figma library
---

# Badge (Figma component set)

{description}

## Variants
{variant_lines}

## Component properties
{properties_table}

Fetched from the Figma REST API on {today}. Figma reports the file
("{file_name}") last modified {last_modified}.
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file_key", help="Figma file key, from figma.com/design/<file_key>/...")
    parser.add_argument("--set-name", default="Badge", help="Component set name to fetch (default: Badge)")
    parser.add_argument("--node-id", default=None, help="Exact component set node id, from the URL's ?node-id=; overrides --set-name")
    parser.add_argument("--description", default=None, help="Use this text instead of whatever Figma's API reports for the description")
    parser.add_argument("--token", default=None, help="Figma personal access token (default: $FIGMA_TOKEN)")
    args = parser.parse_args()

    token = args.token or os.environ.get("FIGMA_TOKEN")
    if not token:
        print("Set FIGMA_TOKEN in your environment (or pass --token).", file=sys.stderr)
        sys.exit(1)

    file_json = fetch_file(args.file_key, token)
    if args.node_id:
        node_id, set_meta = component_set_by_node_id(file_json, resolve_node_id(args.node_id))
    else:
        node_id, set_meta = find_component_set(file_json, args.set_name)
    node = find_node(file_json["document"], node_id)
    if node is None:
        print(f"Component set '{args.set_name}' is declared but its node ({node_id}) isn't in the document tree.", file=sys.stderr)
        sys.exit(1)

    snapshot = render_snapshot(
        args.file_key, file_json, set_meta, node, date.today().isoformat(),
        description_override=args.description,
    )

    DATA_DIR.mkdir(exist_ok=True)
    out_path = DATA_DIR / "badge__design-figma__www.figma.com.md"
    out_path.write_text(snapshot)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
