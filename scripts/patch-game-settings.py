"""Patch the verified build-12 settings asset, without changing gameplay code.
Requires UnityPy==1.25.4. Inputs and outputs must be supplied explicitly.
"""
from pathlib import Path
from collections import OrderedDict
import argparse
import hashlib
import json
import struct
from urllib.parse import urlparse
import UnityPy
from UnityPy.streams import EndianBinaryReader

parser=argparse.ArgumentParser()
parser.add_argument("--source",required=True)
parser.add_argument("--output",required=True)
parser.add_argument("--report",required=True)
parser.add_argument("--allowed-host",required=True)
args=parser.parse_args()
entry=args.allowed_host
assert urlparse(entry).scheme=="https" and urlparse(entry).hostname=="dombarker99.github.io"
sha=lambda data:hashlib.sha256(data).hexdigest()
original=Path(args.source).read_bytes()
assert sha(original)=="4075129683363ef8237c105b42dfc941c20eab79614326d24f53797e3ed4c5ac"

def unpack(data):
    signature=b"UnityWebData1.0\0"
    assert data.startswith(signature)
    end=struct.unpack_from("<I",data,len(signature))[0]
    pos=len(signature)+4
    files=OrderedDict()
    while pos<end:
        offset,size,length=struct.unpack_from("<III",data,pos);pos+=12
        name=data[pos:pos+length].decode();pos+=length
        assert offset+size<=len(data) and name not in files
        files[name]=data[offset:offset+size]
    assert pos==end
    return files

def pack(files):
    signature=b"UnityWebData1.0\0"
    size=len(signature)+4+sum(12+len(name.encode()) for name in files)
    header=bytearray(signature+struct.pack("<I",size));offset=size
    for name,data in files.items():
        encoded=name.encode()
        header.extend(struct.pack("<III",offset,len(data),len(encoded))+encoded)
        offset+=len(data)
    return bytes(header)+b"".join(files.values())

outer=unpack(original)
metadata=outer["Il2CppData/Metadata/global-metadata.dat"]
u=lambda p:struct.unpack_from("<I",metadata,p)[0]
assert u(4)==27
strings=metadata[u(24):u(24)+u(28)]
position=metadata.index(struct.pack("<II",strings.index(b"CrazySettings\0"),strings.index(b"CrazyGames\0")))
first=struct.unpack_from("<i",metadata,position+32)[0]
count=struct.unpack_from("<H",metadata,position+68)[0]
fields=[]
for i in range(count):
    index=u(u(96)+(first+i)*12)
    fields.append(strings[index:strings.index(b"\0",index)].decode())
assert fields==["whitelistedDomains","pauseGameDuringAd","accountAvailableResponse","linkAccountResponse","getUserResponse","authPromptResponse","getTokenResponse","disableSdkLogs","disableAdPreviews","alwaysThrowAdError","deviceType","applicationType"]
env=UnityPy.load(original)
web=next(iter(env.files.values()))
bundle=web.files["data.unity3d"]
resources=bundle.files["resources.assets"]
target=resources.objects[2007]
data=target.read(check_read=False)
assert data.m_Name=="CrazyGamesSettings"
script=data.m_Script.read()
assert script.m_ClassName=="CrazySettings" and script.m_Namespace=="CrazyGames"
raw=target.get_raw_data()
assert len(raw)==100 and raw[52:56]==b"\0"*4
assert raw[84:88]==b"\0"*4
before={key:sha(obj.get_raw_data()) for key,obj in resources.objects.items()}
# Serialized Boolean fields in this build occupy four-byte aligned slots.
adjusted=bytearray(raw)
adjusted[84]=0  # Retain asynchronous SDK requests; the PWA adapter completes them without previews.
encoded=entry.encode()
new_string=struct.pack("<I",len(encoded))+encoded+b"\0"*((-len(encoded))%4)
patched=bytes(adjusted[:52])+struct.pack("<I",1)+new_string+bytes(adjusted[56:])
target.set_raw_data(patched)
resource_bytes=resources.save()
checked=next(iter(UnityPy.load(resource_bytes).files.values()))
after={key:sha(obj.get_raw_data()) for key,obj in checked.objects.items()}
assert before.keys()==after.keys()
changed=[key for key in before if before[key]!=after[key]]
assert changed==[2007] and checked.objects[2007].get_raw_data()==patched

def contents(child):
    return child.bytes if isinstance(child,EndianBinaryReader) else child.reader.bytes
original_children={name:contents(child) for name,child in bundle.files.items()}
for name,child in list(bundle.files.items()):
    replacement=EndianBinaryReader(resource_bytes if name=="resources.assets" else original_children[name])
    replacement.flags=child.flags
    bundle.files[name]=replacement
new_bundle=bundle.save(packer="original")
checked_bundle=next(iter(UnityPy.load(new_bundle).files.values()))
changed_children=[name for name,child in checked_bundle.files.items() if contents(child)!=original_children[name]]
assert changed_children==["resources.assets"]
outer["data.unity3d"]=new_bundle
output=pack(outer)
assert [name for name,body in unpack(original).items() if unpack(output)[name]!=body]==["data.unity3d"]
roundtrip=UnityPy.load(output)
roundtrip_target=next(obj for obj in roundtrip.objects if obj.assets_file.name=="resources.assets" and obj.path_id==2007)
assert roundtrip_target.get_raw_data()==patched
destination=Path(args.output);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(output)
report={
 "sourceSha256":sha(original),"outputSha256":sha(output),
 "asset":"resources.assets","pathId":2007,"class":"CrazyGames.CrazySettings",
 "changes":{"whitelistedDomains":{"before":[],"after":[entry]}},
 "disableAdPreviews":False,
 "adHandling":"An asynchronous no-ad adapter preserves the original request/completion lifecycle.",
 "unchangedOtherSerializedObjects":len(before)-1,
 "unchangedOtherBundleChildren":len(original_children)-1,
 "unchangedOtherWebDataEntries":len(outer)-1,
 "compiledGameplayCodeModified":False,
 "outputBytes":len(output)
}
Path(args.report).parent.mkdir(parents=True,exist_ok=True)
Path(args.report).write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
