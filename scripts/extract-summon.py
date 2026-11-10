"""从用户录屏中保留完整的六姿态循环，去掉手机界面和边缘连通白底。
Usage: python scripts/extract-summon.py <video.mp4> <output.png>
需要 ffmpeg / ffprobe、Pillow、numpy；不属于游戏构建依赖。
"""
import json, subprocess, sys, tempfile
from pathlib import Path
from collections import deque
import numpy as np
from PIL import Image

video, output = Path(sys.argv[1]), Path(sys.argv[2])
# 用原始解码顺序，不能把手机 VFR 的重复编码帧当成 GIF 的新姿态。
indices = [2, 5, 6, 7, 8, 9]
with tempfile.TemporaryDirectory(prefix='ashen-summon-') as folder:
    subprocess.run(['ffmpeg','-v','fatal','-i',str(video),'-vf','crop=576:576:0:352','-fps_mode','passthrough',folder+'/frame-%03d.png'],check=True)
    frames=[]
    for number in indices:
        rgba=np.array(Image.open(folder+f'/frame-{number:03d}.png').convert('RGBA'))
        rgb=rgba[:,:,:3].astype(int)
        white=(rgb.min(axis=2)>220)&((rgb.max(axis=2)-rgb.min(axis=2))<28)
        height,width=white.shape;outside=np.zeros_like(white);queue=deque()
        for y in range(height):
            for x in [0,width-1]:
                if white[y,x] and not outside[y,x]:outside[y,x]=True;queue.append((x,y))
        for x in range(width):
            for y in [0,height-1]:
                if white[y,x] and not outside[y,x]:outside[y,x]=True;queue.append((x,y))
        while queue:
            x,y=queue.popleft()
            for xx,yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0<=xx<width and 0<=yy<height and white[yy,xx] and not outside[yy,xx]:outside[yy,xx]=True;queue.append((xx,yy))
        rgba[outside,3]=0;rgba[outside,:3]=0
        frames.append(Image.fromarray(rgba))
    bounds=[im.getbbox() for im in frames]
    crop=(min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds))
    scale=44/max(crop[2]-crop[0],crop[3]-crop[1]);size=(round((crop[2]-crop[0])*scale),round((crop[3]-crop[1])*scale))
    sheet=Image.new('RGBA',(48*6,48))
    for i,im in enumerate(frames):
        tile=im.crop(crop).resize(size,Image.Resampling.NEAREST)
        sheet.alpha_composite(tile,(i*48+(48-size[0])//2,46-size[1]))
    output.parent.mkdir(parents=True,exist_ok=True);sheet.save(output)
    print(json.dumps({'source_indices':indices,'crop':crop,'frame_size':[48,48],'frames':6,'loop_seconds':0.366133}))
