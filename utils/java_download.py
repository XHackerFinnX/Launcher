import platform

def get_architecture():
    architecture = platform.architecture()[0]
    return architecture