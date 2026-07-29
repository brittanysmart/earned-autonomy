#!/usr/bin/env python3
"""Tests for the Figma extraction logic in fetch_figma.py.

Figma's API nests what we need (variant names, property defaults) inside a
document tree with a couple of quirks (suffixed property names, variants that
sometimes only exist as child instance names, not variantOptions). These pin
that extraction down against small fixture shapes instead of a live file.

Runnable two ways, no framework required:
    python test_fetch_figma.py     # plain asserts, exits non-zero on failure
    pytest test_fetch_figma.py     # also collected as normal test_* functions
"""

from fetch_figma import (
    component_set_by_node_id,
    extract_variants,
    find_component_set,
    render_properties_table,
    render_snapshot,
    resolve_description,
    resolve_node_id,
    strip_prop_suffix,
)


def test_strip_prop_suffix_removes_node_id():
    assert strip_prop_suffix("variant#123:4") == "variant"


def test_strip_prop_suffix_leaves_plain_names_alone():
    assert strip_prop_suffix("variant") == "variant"


def test_extract_variants_from_variant_options():
    prop_defs = {
        "variant#1:2": {"type": "VARIANT", "variantOptions": ["default", "secondary"]},
    }
    assert extract_variants({}, prop_defs) == ["default", "secondary"]


def test_extract_variants_falls_back_to_child_names():
    # Some kits declare the VARIANT property without variantOptions populated;
    # the values still exist on each variant's own instance name.
    prop_defs = {"variant#1:2": {"type": "VARIANT", "variantOptions": []}}
    node = {
        "children": [
            {"name": "variant=default, state=hover"},
            {"name": "variant=secondary, state=hover"},
            {"name": "variant=default, state=focus"},  # duplicate value, not repeated
        ]
    }
    assert extract_variants(node, prop_defs) == ["default", "secondary"]


def test_render_properties_table_strips_suffix_and_joins_options():
    prop_defs = {
        "variant#1:2": {"type": "VARIANT", "defaultValue": "default", "variantOptions": ["default", "secondary"]},
    }
    table = render_properties_table(prop_defs)
    assert "| variant | VARIANT | default | default, secondary |" in table
    assert "#1:2" not in table


def test_render_properties_table_handles_no_properties():
    assert render_properties_table({}) == "_No component properties declared on this set._"


def test_component_set_by_node_id_reports_wrong_node_type():
    # A common mistake: selecting one variant instance in Figma instead of the
    # parent component set. This should exit cleanly with a diagnosis, not a
    # bare KeyError/traceback.
    file_json = {
        "componentSets": {},
        "document": {
            "id": "0:0",
            "children": [{"id": "5002:1796", "type": "COMPONENT", "name": "Badge/default", "children": []}],
        },
    }
    try:
        component_set_by_node_id(file_json, "5002:1796")
        assert False, "expected SystemExit"
    except SystemExit:
        pass


def test_resolve_description_prefers_component_set_summary():
    assert resolve_description({"description": "from summary"}, {"description": "from node"}) == "from summary"


def test_resolve_description_falls_back_to_node_description():
    # componentSets summary description is publisher-only per Figma's docs; an
    # unpublished draft file's description often only shows up on the node.
    assert resolve_description({"description": ""}, {"description": "from node"}) == "from node"


def test_resolve_description_placeholder_when_both_empty():
    assert resolve_description({}, {}) == "(no description set on the component set)"


def test_render_snapshot_description_override_wins_over_figma():
    # Escape hatch for when the description was typed onto a variant instead
    # of the set itself, and Figma's API has no way to surface it from there.
    snapshot = render_snapshot(
        "abc123",
        {"name": "some-file"},
        {"description": "from figma"},
        {"description": "", "componentPropertyDefinitions": {}},
        "2026-07-29",
        description_override="the real one, supplied by hand",
    )
    assert "the real one, supplied by hand" in snapshot
    assert "from figma" not in snapshot


def test_resolve_node_id_converts_url_hyphen_to_colon():
    assert resolve_node_id("5002-1796") == "5002:1796"


def test_find_component_set_prefers_the_one_with_a_description():
    # The real scenario that prompted this: a kit duplicates a page (Base UI vs
    # Radix), producing two component sets both named "Badge". Only one has a
    # real description; that's the one we want without needing --node-id.
    file_json = {
        "componentSets": {
            "1:1": {"name": "Badge", "description": ""},
            "2:2": {"name": "Badge", "description": "The real one"},
        },
        "document": {
            "id": "0:0",
            "children": [
                {"id": "1:1", "type": "COMPONENT_SET", "name": "Badge", "children": []},
                {"id": "2:2", "type": "COMPONENT_SET", "name": "Badge", "children": []},
            ],
        },
    }
    node_id, meta = find_component_set(file_json, "Badge")
    assert node_id == "2:2"
    assert meta["description"] == "The real one"


def test_find_component_set_falls_back_to_first_when_all_empty():
    file_json = {
        "componentSets": {
            "1:1": {"name": "Badge", "description": ""},
            "2:2": {"name": "Badge", "description": ""},
        },
        "document": {"id": "0:0", "children": []},
    }
    node_id, meta = find_component_set(file_json, "Badge")
    assert node_id == "1:1"


def test_component_set_by_node_id_finds_exact_match():
    # The whole point of --node-id: a file can have two sets sharing a name
    # ("Badge", "Badge"), where only the id disambiguates which one a
    # description was actually added to.
    file_json = {"componentSets": {"1:1": {"name": "Badge", "description": "wrong one"}, "2:2": {"name": "Badge", "description": "right one"}}}
    node_id, meta = component_set_by_node_id(file_json, "2:2")
    assert node_id == "2:2"
    assert meta["description"] == "right one"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all fetch_figma tests passed")
