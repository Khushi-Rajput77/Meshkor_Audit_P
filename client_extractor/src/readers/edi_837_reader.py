def read_edi_837(path):
    """Reserved adapter boundary; parsing is deliberately not guessed."""
    raise NotImplementedError(
        "837P/837I parsing is not enabled. Use a validated CSV/XLSX export until an "
        "implementation is built against the employer's companion guides and adjudication rules."
    )
