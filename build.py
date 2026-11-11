import re
s=open('dev.html',encoding='utf-8').read()
def inline(m):
    out=[]
    for src in re.findall(r'<script src="([^"]+)"></script>', m.group(0)):
        out.append('<script>\n'+open(src,encoding='utf-8').read().replace('</script','<\\/script')+'\n</script>')
    return '\n'.join(out)
s=re.sub(r'<!--SCRIPTS-->.*?<!--/SCRIPTS-->', inline, s, flags=re.S)
open('荒漠里的造雨塔.html','w',encoding='utf-8').write(s)
print(len(s))
