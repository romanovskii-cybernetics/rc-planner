package main

import (
	"embed"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

// Embed a directory
//
//go:embed frontend/dist/*
var embedDirStatic embed.FS

func main() {
	app := fiber.New()

	// Middleware
	app.Use(logger.New())

	// Serve static files
	app.Static("/plans/", "./plans")
	/*

		// Serve static files
		app.Static("/", "./frontend/dist")

		// API routes
		ap8p.Get("/api/hello", func(c *fiber.Ctx) error {
			return c.JSON(fiber.Map{"message": "Hello, World!"})
		})
	*/

	app.Use("/", filesystem.New(filesystem.Config{
		Root:       http.FS(embedDirStatic),
		PathPrefix: "frontend/dist",
		Browse:     true,
	}))

	// API routes
	app.Get("/api/plans/list", func(c *fiber.Ctx) error {
		plans := []string{}
		entries, err := os.ReadDir("./plans")
		if err != nil {
			return c.JSON(fiber.Map{"error": err.Error()})
		}

		for _, e := range entries {
			plans = append(plans, e.Name())
		}

		sort.Strings(plans)
		return c.SendString(strings.Join(plans, "\r\n"))
	})

	// Start server
	app.Listen(":3000")
}
