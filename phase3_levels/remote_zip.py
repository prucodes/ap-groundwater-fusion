"""Read single members of a large remote zip (Zenodo) with HTTP range requests.

The ESA WorldCereal 2021 products are published as one global zip per product,
15-25 GB each; Andhra Pradesh needs a few hundred megabytes of them. zipfile
only needs to seek and read, so a file object that turns each read into a
range request lets it list the archive and extract one member without
downloading the rest.
"""
import io
import urllib.request

from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

CHUNK = 1 << 20


class RemoteFile(io.RawIOBase):
    def __init__(self, url, size=None):
        self.url, self.pos = url, 0
        self.size = size if size is not None else self._size()
        self._cache = {}

    def _size(self):
        request = urllib.request.Request(self.url, method="HEAD")
        with urllib.request.urlopen(request, timeout=60, context=_tls_context()) as answer:
            return int(answer.headers["Content-Length"])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        self.pos = offset if whence == io.SEEK_SET else self.pos + offset if whence == io.SEEK_CUR else self.size + offset
        return self.pos

    def _chunk(self, index):
        if index not in self._cache:
            start = index * CHUNK
            end = min(start + CHUNK, self.size) - 1
            request = urllib.request.Request(self.url, headers={"Range": f"bytes={start}-{end}"})
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(request, timeout=120, context=_tls_context()) as answer:
                        if answer.status != 206:
                            raise OSError(f"range request answered {answer.status}")
                        self._cache[index] = answer.read()
                    break
                except OSError:
                    if attempt == 4:
                        raise
            if len(self._cache) > 64:
                self._cache.pop(next(iter(self._cache)))
        return self._cache[index]

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        out = bytearray()
        while n:
            index, offset = divmod(self.pos, CHUNK)
            piece = self._chunk(index)[offset:offset + n]
            out += piece
            self.pos += len(piece)
            n -= len(piece)
        return bytes(out)

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)
