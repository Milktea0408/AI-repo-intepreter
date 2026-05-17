VENV := .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PYTHON_BIN ?= python3.12
REQ := requirements.txt
HOST := 127.0.0.1
PORT := 8000

.PHONY: all venv install run run-dev freeze clean help

all: install

help:
	@echo "Targets:"
	@echo "  make install   Create venv and install dependencies"
	@echo "  make run       Run the app (prod)"
	@echo "  make run-dev   Run with --reload (dev)"
	@echo "  make freeze    Write installed packages to $(REQ)"
	@echo "  make clean     Remove the venv"

venv:
	test -d $(VENV) || $(PYTHON_BIN) -m venv $(VENV)

install: venv
	$(PY) -m pip install --upgrade "pip<26" setuptools wheel
	$(PIP) install -r $(REQ)

run: venv
	$(PY) -m uvicorn main:app --host 0.0.0.0 --port $(PORT)

run-dev: venv
	$(PY) -m uvicorn main:app --reload --host $(HOST) --port $(PORT)

freeze: venv
	$(PIP) freeze > $(REQ)

clean:
	rm -rf $(VENV)