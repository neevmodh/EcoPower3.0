FROM emqx/emqx:5.8.4

# Railway needs a $PORT-driven healthcheck-free TCP listener; MQTT itself
# stays on the standard 1883, exposed via a Railway TCP proxy (fixed port,
# not HTTP) per #14. Dashboard on 18083 is left internal-only for now.
EXPOSE 1883 18083
