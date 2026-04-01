import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { type Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Navagraha API Documentation',
      version: '1.0.0',
      description: 'API endpoints for the Navagraha Astrology Platform (Frontend, Admin, and Executive API)',
    },
    servers: [
      {
        url: '/',
        description: 'Local development server',
      },
    ],
  },
  apis: ['./server/routes.ts', './server/swagger.ts'], // Auto-parse docs from these files
};

export const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
  }));

  console.log('[swagger] API Docs available at /api-docs');
}

/**
 * @openapi
 * /api/config:
 *   get:
 *     summary: Retrieve public platform configuration
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Config variables for Google Maps, Agora, and PostHog
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 googleMapsApiKey:
 *                   type: string
 *                 razorpayKeyId:
 *                   type: string
 *                 agoraAppId:
 *                   type: string
 *                 posthogKey:
 *                   type: string
 */

/**
 * @openapi
 * /api/user:
 *   get:
 *     summary: Get currently authenticated user session
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user context
 *       401:
 *         description: Not authenticated
 */
