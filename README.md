# Tug of War — Math Match

A static, mobile-friendly math tug-of-war game. Two players join a room from their own devices and answer at the same time; a third device hosts the shared scoreboard for a projector.

## Run locally

Open `index.html` in a browser, or serve this folder with any static file server. Players and the monitor need an internet connection to connect to the PeerJS signaling service.

## Publish on GitHub Pages

1. Push these files to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**, select the branch and `/ (root)`, then save.
3. Open the published site on the monitor and select **Create monitor room**.
4. Open the same site on each player's phone, enter the displayed six-character code, choose different teams, and join.
5. Start the game from the monitor once both players have joined. Keep that tab open for the duration of the match.

## How rooms work

The site is frontend-only: PeerJS (loaded from its public CDN) provides signaling, and browsers exchange game data peer-to-peer. The monitor browser is the room host and source of truth for scores and answers; it does not need to be one of the players. No game account or application server is required.

Room codes are temporary and work only while the monitor remains open. Network restrictions, browser extensions, or an unavailable public signaling service can prevent connections. For a production deployment that needs guaranteed connectivity, use a managed real-time service or your own signaling/TURN infrastructure.
