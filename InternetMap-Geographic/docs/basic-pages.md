# Basic pages

Besides the topology pages, `internet-map-globe` keeps a small set of basic pages:

- Home
- Console
- 404

## Home

Path: `/home`

The Home page is the entry page. It provides cards for the main topology views.

This project does not currently provide Dashboard or Plugin pages. Container, network, capture, and replay features are consolidated into the topology pages.

## Console

Path: `/console`

The Console page opens a container terminal through the backend Docker API capability. This feature has security implications and should only be used in trusted environments.

## 404

Unknown routes are routed to the 404 page.
