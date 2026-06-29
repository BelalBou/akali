# Akali — developer commands.
# Run these from Git Bash, WSL or any POSIX shell.

COMPOSE := docker compose
PNPM := pnpm

.DEFAULT_GOAL := help
.PHONY: help env install build build-packages dev bot worker setup \
        up down restart logs ps images db-up db-down migrate migrate-deploy \
        generate studio deploy-commands clean nuke

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || cp .env.example .env
	@echo "✓ .env ready (edit it to add your DISCORD_TOKEN)"

install: ## Install all workspace dependencies
	$(PNPM) install

build-packages: ## Build only the shared packages
	$(PNPM) --filter "./packages/*" -r build

build: ## Build every workspace package
	$(PNPM) -r build

setup: env install db-up generate migrate ## First-time setup: env + deps + db + migrations
	@echo "✓ Setup complete. Add your DISCORD_TOKEN to .env, then run 'make dev' or 'make up'."

dev: build-packages ## Run bot + worker locally with hot reload (needs 'make db-up')
	$(PNPM) --parallel --filter "./apps/*" dev

bot: build-packages ## Run only the bot locally
	$(PNPM) --filter @akali/bot dev

worker: build-packages ## Run only the worker locally
	$(PNPM) --filter @akali/worker dev

# ── Docker (full stack) ────────────────────────────────────────
up: env ## Build images and start the whole stack (postgres + migrate + bot + worker)
	$(COMPOSE) up -d --build

down: ## Stop the stack
	$(COMPOSE) down

restart: ## Restart the stack
	$(COMPOSE) restart

logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=100

ps: ## Show running services
	$(COMPOSE) ps

images: ## Build all docker images without starting
	$(COMPOSE) build

# ── Database ───────────────────────────────────────────────────
db-up: ## Start only PostgreSQL (detached)
	$(COMPOSE) up -d postgres

db-down: ## Stop PostgreSQL
	$(COMPOSE) stop postgres

migrate: ## Create/apply a dev migration (prisma migrate dev)
	$(PNPM) --filter @akali/db migrate

migrate-deploy: ## Apply pending migrations (prisma migrate deploy)
	$(PNPM) --filter @akali/db deploy

generate: ## Generate the Prisma client
	$(PNPM) --filter @akali/db generate

studio: ## Open Prisma Studio
	$(PNPM) --filter @akali/db studio

deploy-commands: ## Register the bot's slash commands with Discord
	$(PNPM) --filter @akali/bot deploy-commands

# ── Cleanup ────────────────────────────────────────────────────
clean: ## Remove build outputs
	$(PNPM) -r clean

nuke: ## Remove the stack AND the database volume (destroys data)
	$(COMPOSE) down -v
