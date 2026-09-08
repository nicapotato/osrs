"""Minimal Lua table parser for Module:Questreq/data."""

from __future__ import annotations

from typing import Any


class LuaTableError(ValueError):
    pass


class LuaTableParser:
    def __init__(self, source: str):
        self.source = source
        self.n = len(source)
        self.i = 0

    def parse_value(self) -> Any:
        self._skip()
        if self.i >= self.n:
            raise LuaTableError("unexpected end of input")
        ch = self.source[self.i]
        if ch == "{":
            return self._parse_table()
        if ch in "'\"":
            return self._parse_string()
        if ch.isdigit() or (ch == "-" and self._peek_is_digit()):
            return self._parse_number()
        if ch.isalpha() or ch == "_":
            ident = self._parse_ident()
            if ident == "true":
                return True
            if ident == "false":
                return False
            if ident == "nil":
                return None
            raise LuaTableError(f"unexpected identifier {ident!r} at {self.i}")
        raise LuaTableError(f"unexpected {ch!r} at {self.i}")

    def _peek_is_digit(self) -> bool:
        return self.i + 1 < self.n and self.source[self.i + 1].isdigit()

    def _parse_table(self) -> dict[Any, Any] | list[Any]:
        assert self.source[self.i] == "{"
        self.i += 1
        entries: list[tuple[Any, Any]] = []
        list_items: list[Any] = []
        next_index = 1
        saw_named = False
        while True:
            self._skip()
            if self.i >= self.n:
                raise LuaTableError("unclosed table")
            if self.source[self.i] == "}":
                self.i += 1
                break
            key, value = self._parse_field(next_index)
            if key == next_index and not saw_named:
                list_items.append(value)
                next_index += 1
            else:
                saw_named = True
                entries.append((key, value))
            self._skip()
            if self.i < self.n and self.source[self.i] == ",":
                self.i += 1
                continue
            self._skip()
            if self.i < self.n and self.source[self.i] == "}":
                self.i += 1
                break
            raise LuaTableError(f"expected ',' or '}}' at {self.i}")
        if not saw_named:
            return list_items
        result: dict[Any, Any] = {}
        for idx, item in enumerate(list_items, start=1):
            result[idx] = item
        for key, value in entries:
            result[key] = value
        return result

    def _parse_field(self, next_index: int) -> tuple[Any, Any]:
        self._skip()
        if self.source[self.i] == "[":
            self.i += 1
            self._skip()
            key = self.parse_value()
            self._skip()
            if self.i >= self.n or self.source[self.i] != "]":
                raise LuaTableError(f"expected ']' after table key at {self.i}")
            self.i += 1
            self._skip()
            if self.i >= self.n or self.source[self.i] != "=":
                raise LuaTableError(f"expected '=' after table key at {self.i}")
            self.i += 1
            return key, self.parse_value()
        if self.source[self.i].isalpha() or self.source[self.i] == "_":
            start = self.i
            ident = self._parse_ident()
            self._skip()
            if self.i < self.n and self.source[self.i] == "=":
                self.i += 1
                return ident, self.parse_value()
            self.i = start
        return next_index, self.parse_value()

    def _parse_string(self) -> str:
        quote = self.source[self.i]
        assert quote in "'\""
        self.i += 1
        out: list[str] = []
        while self.i < self.n:
            ch = self.source[self.i]
            if ch == "\\":
                if self.i + 1 >= self.n:
                    raise LuaTableError("unterminated string escape")
                nxt = self.source[self.i + 1]
                escapes = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", "'": "'", '"': '"'}
                out.append(escapes.get(nxt, nxt))
                self.i += 2
                continue
            if ch == quote:
                self.i += 1
                return "".join(out)
            out.append(ch)
            self.i += 1
        raise LuaTableError("unterminated string")

    def _parse_number(self) -> int | float:
        start = self.i
        if self.source[self.i] == "-":
            self.i += 1
        while self.i < self.n and (self.source[self.i].isdigit() or self.source[self.i] == "."):
            self.i += 1
        token = self.source[start : self.i]
        if "." in token:
            return float(token)
        return int(token)

    def _parse_ident(self) -> str:
        start = self.i
        self.i += 1
        while self.i < self.n and (self.source[self.i].isalnum() or self.source[self.i] == "_"):
            self.i += 1
        return self.source[start : self.i]

    def _skip(self) -> None:
        while self.i < self.n:
            ch = self.source[self.i]
            if ch.isspace():
                self.i += 1
                continue
            if ch == "-" and self.i + 1 < self.n and self.source[self.i + 1] == "-":
                self.i += 2
                if self.i + 1 < self.n and self.source[self.i : self.i + 2] == "[[":
                    raise LuaTableError("block comments are not supported")
                while self.i < self.n and self.source[self.i] not in "\n\r":
                    self.i += 1
                continue
            return


def extract_questreq_table(source: str) -> dict[str, Any]:
    text = source
    fence = text.find("```")
    if fence != -1:
        start = text.find("\n", fence)
        end = text.find("```", start + 1)
        if start == -1 or end == -1:
            raise LuaTableError("could not unwrap markdown-fenced Lua")
        text = text[start + 1 : end]

    marker = "local questReqs"
    idx = text.find(marker)
    if idx == -1:
        raise LuaTableError("missing `local questReqs` assignment")
    eq = text.find("=", idx)
    if eq == -1:
        raise LuaTableError("missing `=` after questReqs")
    parser = LuaTableParser(text[eq + 1 :])
    value = parser.parse_value()
    if not isinstance(value, dict):
        raise LuaTableError(f"questReqs must be a table, got {type(value).__name__}")
    for key in value:
        if not isinstance(key, str):
            raise LuaTableError(f"questReqs key must be a string, got {key!r}")
    return value
