# Penpot-SVG-Importer

Penpot Importer is a custom Penpot plugin that allows users to import Miro-exported .svg files into Penpot.

The importer attempts to preserve:

Raster images
Vector graphics
Text
Image positioning and transformations
External Miro images
Supported image clipping/cropping

Latest Version: Miro-Penpot-Importer-v0.9.2

[!NOTE]
This guide assumes that Penpot has already been installed and is running locally on your device.

Prerequisites

Before installing the plugin, make sure you have:

Penpot installed and running
Docker and Docker Compose configured for your Penpot installation
Git installed
Node.js installed
Access to the Penpot web interface

You can verify that Node.js is installed with:

node --version

1. Download the Penpot Importer

Clone the repository:

git clone https://github.com/Sbairamian/Penpot-Importer.git

Enter the repository directory:

cd Penpot-Importer

Alternatively, download the latest release from the Releases section of this repository.

2. Verify the Plugin Files

The plugin directory should contain the following files:

Penpot-Importer/
├── cors-server.js
├── index.html
├── manifest.json
├── plugin.js
└── icon.svg

These files should remain in the same directory.

What do these files do?
manifest.json — Provides Penpot with the plugin name, permissions, main JavaScript file, and icon.
plugin.js — Contains the Penpot plugin logic.
index.html — Provides the user interface for selecting and importing SVG files.
icon.svg — Plugin icon displayed by Penpot.
cors-server.js — Hosts the plugin locally, provides the required CORS headers, and proxies supported external Miro images.

3. Start the Local Plugin Server

The importer includes its own Node.js server, so an additional web server such as http-server is not required.

From inside the Penpot-Importer directory, run:

node cors-server.js

The server will start on port 8123.

You should see output similar to:

Local Miro SVG Importer server
Serving /path/to/Penpot-Importer
Open: http://127.0.0.1:8123/manifest.json
Proxy test route: http://127.0.0.1:8123/proxy-image?url=<encoded-miro-image-url>

Keep this terminal open while using the plugin.

4. Verify the Plugin Server

Before adding the plugin to Penpot, open the following URL in your browser:

http://127.0.0.1:8123/manifest.json

If the server is working correctly, you should see JSON similar to:

{
  "name": "Local Miro SVG Importer",
  "description": "Offline local importer for Miro SVG files",
  "code": "/plugin.js",
  "icon": "/icon.svg",
  "permissions": [
    "content:read",
    "content:write"
  ]
}

You can also verify the server itself by opening:

http://127.0.0.1:8123/server-version

If both pages load, the plugin server is ready.

5. Open your local instance of Penpot

Open your existing Penpot installation in your web browser.

For a default local Docker installation, Penpot is typically available at:

http://localhost:9001

Log in and open a Penpot project.

6. Open the Penpot Plugin Manager

Once inside a Penpot project, open the Plugin Manager.

Windows/Linux
Ctrl + Alt + P
macOS
Command + Alt + P

The Plugin Manager can also be opened through the Penpot interface.

7. Install the Plugin

In the Plugin Manager, enter the URL of the importer's manifest.json file:

http://127.0.0.1:8123/manifest.json

Select Install.

Penpot will display the permissions requested by the plugin.

The importer currently requests:

content:read
content:write

Review and approve the permissions to complete the installation.

8. Open Penpot Importer

After installation, locate Local Miro SVG Importer in the Plugin Manager and select Open.

The importer interface should appear inside Penpot.

9. Import an SVG

Select the Miro-exported .svg file you want to import.

The plugin will scan the SVG and attempt to identify:

Embedded images
Externally linked images
Vector graphics
Text
Image clipping information

After selecting the file, select:

Import SVG Images + Vector Overlay + Text

The plugin will then create the supported elements inside the current Penpot document.

External Images

Some Miro SVG exports reference images hosted externally instead of embedding the images directly inside the SVG.

The included cors-server.js provides a local proxy that attempts to retrieve supported Miro-hosted images automatically.

The importer sends these requests through:

/proxy-image

For example:

http://127.0.0.1:8123/proxy-image?url=<MIRO-IMAGE-URL>

The proxy is restricted to HTTPS URLs hosted on:

miro.com
*.miro.com

If an external image cannot be retrieved automatically, the importer may provide an option to manually select the corresponding image file.

Running the Plugin from Another Computer

127.0.0.1 and localhost always refer to the computer running your web browser.

If cors-server.js is running on the same computer as your browser, use:

http://127.0.0.1:8123/manifest.json

If the plugin server is running on another machine, such as the Ubuntu Server hosting Penpot, use that server's IP address instead.

For example:

http://192.168.1.50:8123/manifest.json

Replace 192.168.1.50 with the IP address of the machine running cors-server.js.

The device running your web browser must be able to reach TCP port 8123 on that machine.

Important: Penpot Docker and the Plugin Server

The plugin does not need to be copied into the Penpot Docker containers.

Penpot plugins are hosted separately and installed using the URL to their manifest.json file.


For example:

Penpot:
http://192.168.1.50:9001

Importer:
http://192.168.1.50:8123/manifest.json
Stopping the Plugin Server

To stop the importer server, return to the terminal where cors-server.js is running and press:

Ctrl + C

The plugin files will no longer be available to Penpot until the server is started again:

node cors-server.js


                                                                                                      Troubleshooting

                                                                                                Manifest.json does not load

Make sure the importer server is running:

node cors-server.js

Then test:

http://127.0.0.1:8123/manifest.json
Penpot cannot install the plugin

Verify that all of the following URLs load in your browser:

http://127.0.0.1:8123/manifest.json
http://127.0.0.1:8123/plugin.js
http://127.0.0.1:8123/index.html
http://127.0.0.1:8123/icon.svg

If Penpot and the importer are running on another computer, replace 127.0.0.1 with that computer's IP address.

The plugin loads but external images are missing

The importer attempts to proxy Miro-hosted external images automatically.

Check that the Node.js server is still running and look at the importer log for messages related to:

External images proxy-fetched
External proxy fetch failed
External image refs unmatched

Some protected Miro images may not be retrievable automatically. In those cases, the importer can use manually selected image files when available.

                                                                                          Port 8123 is not reachable

If the server is running on another computer, verify that:

The server is running.
TCP port 8123 is allowed through the host firewall.
The client computer can reach the server's IP address.
No other application is already using port 8123.
Security Note

The importer server listens on port 8123 and is intended primarily for local or trusted-network use.

Avoid exposing the importer server directly to the public Internet.

Future Documentation

Additional documentation covering the import process, supported SVG elements, external image handling, known limitations, and troubleshooting will be added in future releases.
