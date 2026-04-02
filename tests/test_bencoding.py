import pytest

from collections import OrderedDict

from pytorrent.bencoding import BencodeError, Decoder, Encoder, bdecode_first


def test_int_roundtrip():
    assert Decoder(b"i0e").decode() == 0
    assert Decoder(b"i42e").decode() == 42
    assert Decoder(b"i-9e").decode() == -9
    assert Encoder(123).encode() == b"i123e"


def test_str_roundtrip():
    assert Decoder(b"5:hello").decode() == b"hello"
    assert Encoder(b"spam").encode() == b"4:spam"


def test_list_dict():
    d = OrderedDict()
    d[b"a"] = 1
    d[b"b"] = [b"x", 2]
    enc = Encoder(d).encode()
    out = Decoder(enc).decode()
    assert isinstance(out, OrderedDict)
    assert out[b"a"] == 1
    assert out[b"b"] == [b"x", 2]


def test_trailing_rejected():
    with pytest.raises(BencodeError):
        Decoder(b"i4ee").decode()


def test_bdecode_first_with_trailing():
    enc_dict = b"d3:foo3:bare"
    d, n = bdecode_first(enc_dict + b"i99e")
    assert n == len(enc_dict)
    assert isinstance(d, OrderedDict)
    assert d[b"foo"] == b"bar"
    d2, n2 = bdecode_first(b"i99eEXTRA")
    assert d2 == 99
    assert n2 == 4
