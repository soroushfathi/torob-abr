-- Keep the session owner stable while changing role; logout expires instead of
-- deleting rows referenced by saved projects. No permission to change IDs.
GRANT UPDATE (role, expires_at) ON app.sessions TO torob_app;
