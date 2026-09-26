"""JSON-lines structured logging: one object per line, easy to ship to any log backend."""

import json
import logging

_STD = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        data.update({k: v for k, v in vars(record).items() if k not in _STD and not k.startswith("_")})
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger("app")
    root.handlers = [handler]
    root.setLevel(level)
    root.propagate = False
