import logging


def configure_secure_logger():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    logger = logging.getLogger("meshkor.client_extractor")
    logger.propagate = False
    return logger
