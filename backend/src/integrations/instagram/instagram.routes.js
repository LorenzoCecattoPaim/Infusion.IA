import express from "express";

function createInstagramRouter({ requireAuth, controller }) {
  const router = express.Router();

  router.get("/connect", requireAuth, controller.connect);
  router.get("/callback", controller.callback);
  router.get("/accounts", requireAuth, controller.getAccounts);
  router.post("/publish", requireAuth, controller.publish);

  return router;
}

export { createInstagramRouter };
